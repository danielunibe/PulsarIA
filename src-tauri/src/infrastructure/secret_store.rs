//! Secret storage for user-configured AI provider keys.
//!
//! Windows Credential Manager owns the persistence and encryption boundary.
//! Secrets are never serialized into app settings or returned to the web UI.

const TARGET_PREFIX: &str = "Pulsaria.AI.Provider.";
const MAX_SECRET_BYTES: usize = 2_560;

fn target_name(profile_id: &str) -> String {
    format!("{TARGET_PREFIX}{profile_id}")
}

#[cfg(windows)]
mod windows_vault {
    use super::{target_name, MAX_SECRET_BYTES};
    use std::ffi::c_void;
    use std::ptr::null_mut;
    use std::slice;
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
        CRED_TYPE_GENERIC,
    };

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn save(profile_id: &str, secret: &str) -> Result<(), String> {
        if secret.len() > MAX_SECRET_BYTES {
            return Err("La clave supera el tamaño admitido por el almacén de Windows.".into());
        }
        let target = wide(&target_name(profile_id));
        let username = wide("Pulsaria");
        let mut blob = secret.as_bytes().to_vec();
        let credential = CREDENTIALW {
            Type: CRED_TYPE_GENERIC,
            TargetName: target.as_ptr() as *mut u16,
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            UserName: username.as_ptr() as *mut u16,
            ..Default::default()
        };
        let saved = unsafe { CredWriteW(&credential, 0) };
        if saved == 0 {
            return Err("Windows no pudo guardar la clave en Credential Manager.".into());
        }
        Ok(())
    }

    pub fn load(profile_id: &str) -> Result<Option<String>, String> {
        let target = wide(&target_name(profile_id));
        let mut credential: *mut CREDENTIALW = null_mut();
        let read = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) };
        if read == 0 {
            let error = unsafe { windows_sys::Win32::Foundation::GetLastError() };
            if error == windows_sys::Win32::Foundation::ERROR_NOT_FOUND {
                return Ok(None);
            }
            return Err("Windows no pudo leer la clave de Credential Manager.".into());
        }
        if credential.is_null() {
            return Ok(None);
        }
        let result = unsafe {
            let value = &*credential;
            if value.CredentialBlob.is_null() || value.CredentialBlobSize == 0 {
                Ok(None)
            } else {
                let bytes =
                    slice::from_raw_parts(value.CredentialBlob, value.CredentialBlobSize as usize);
                String::from_utf8(bytes.to_vec())
                    .map(Some)
                    .map_err(|_| "La clave guardada no tiene un formato válido.".to_string())
            }
        };
        unsafe { CredFree(credential.cast::<c_void>() as *const c_void) };
        result
    }

    pub fn remove(profile_id: &str) -> Result<(), String> {
        let target = wide(&target_name(profile_id));
        let removed = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if removed == 0 {
            let error = unsafe { windows_sys::Win32::Foundation::GetLastError() };
            if error != windows_sys::Win32::Foundation::ERROR_NOT_FOUND {
                return Err("Windows no pudo eliminar la clave de Credential Manager.".into());
            }
        }
        Ok(())
    }
}

#[cfg(windows)]
pub fn save(profile_id: &str, secret: &str) -> Result<(), String> {
    windows_vault::save(profile_id, secret)
}

#[cfg(windows)]
pub fn load(profile_id: &str) -> Result<Option<String>, String> {
    windows_vault::load(profile_id)
}

#[cfg(windows)]
pub fn remove(profile_id: &str) -> Result<(), String> {
    windows_vault::remove(profile_id)
}

#[cfg(not(windows))]
pub fn save(_profile_id: &str, _secret: &str) -> Result<(), String> {
    Err("El almacén de claves de proveedores solo está disponible en Windows.".into())
}

#[cfg(not(windows))]
pub fn load(_profile_id: &str) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(not(windows))]
pub fn remove(_profile_id: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::target_name;

    #[test]
    fn provider_keys_have_an_app_scoped_target_name() {
        assert_eq!(
            target_name("profile-123"),
            "Pulsaria.AI.Provider.profile-123"
        );
    }
}
