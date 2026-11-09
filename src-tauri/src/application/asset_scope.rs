use std::fs;
use std::path::{Component, Path, PathBuf};

const MAX_RENDERABLE_ASSET_PATH_BYTES: usize = 32_768;
const RENDERABLE_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "webm", "mov", "avi", "mp3", "wav", "flac", "ogg", "m4a", "jpg", "jpeg", "png",
    "webp", "bmp", "gif",
];

/// Validates a single local file for temporary Tauri asset-protocol access.
/// Files are admitted separately only after `db::is_renderable_asset_path`
/// confirms the exact path belongs to a persisted library or evidence record.
pub fn validate_renderable_asset_path(path: &Path) -> Result<PathBuf, &'static str> {
    if path.as_os_str().to_string_lossy().len() > MAX_RENDERABLE_ASSET_PATH_BYTES {
        return Err("asset path is too long");
    }
    if is_network_path(path) {
        return Err("network asset paths are not allowed");
    }
    if !path.is_absolute() {
        return Err("asset path must be absolute");
    }
    if path
        .components()
        .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err("asset path contains traversal components");
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !RENDERABLE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("asset type is not renderable");
    }
    if path_has_symlink_component(path) {
        return Err("asset path contains a symbolic link or reparse point");
    }
    let metadata = fs::metadata(path).map_err(|_| "asset file is unavailable")?;
    if !metadata.is_file() {
        return Err("asset path is not a regular file");
    }
    fs::canonicalize(path).map_err(|_| "asset file is unavailable")?;
    Ok(path.to_path_buf())
}

fn is_network_path(path: &Path) -> bool {
    let normalized = path
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();
    normalized.starts_with("\\\\")
        && (!normalized.starts_with("\\\\?\\") && !normalized.starts_with("\\\\.\\")
            || normalized.starts_with("\\\\?\\unc\\")
            || normalized.starts_with("\\\\.\\unc\\"))
}

fn path_has_symlink_component(path: &Path) -> bool {
    let mut current = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => current.push(prefix.as_os_str()),
            Component::RootDir => current.push(component.as_os_str()),
            Component::CurDir | Component::ParentDir => return true,
            Component::Normal(part) => {
                current.push(part);
                let Ok(metadata) = fs::symlink_metadata(&current) else {
                    return true;
                };
                if metadata_has_link_or_reparse_point(&metadata) {
                    return true;
                }
            }
        }
    }
    false
}

fn metadata_has_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(windows))]
    false
}

#[cfg(test)]
mod tests {
    use super::{is_network_path, validate_renderable_asset_path};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "pulsaria-asset-scope-{label}-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn allows_only_existing_absolute_renderable_files() {
        let root = test_root("types");
        fs::create_dir_all(&root).unwrap();
        let video = root.join("video.mp4");
        let transcript = root.join("transcript.txt");
        fs::write(&video, b"synthetic video bytes").unwrap();
        fs::write(&transcript, b"synthetic transcript").unwrap();

        assert_eq!(validate_renderable_asset_path(&video).unwrap(), video);
        assert!(validate_renderable_asset_path(Path::new("relative.mp4")).is_err());
        assert!(validate_renderable_asset_path(&transcript).is_err());
        assert!(validate_renderable_asset_path(&root.join("missing.mp4")).is_err());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_parent_traversal_before_filesystem_access() {
        let path = std::env::temp_dir()
            .join("pulsaria-asset-scope")
            .join("..")
            .join("outside.mp4");
        assert!(validate_renderable_asset_path(&path).is_err());
    }

    #[test]
    fn rejects_unc_paths_and_keeps_local_drive_namespace_paths_local() {
        assert!(is_network_path(Path::new(
            r"\\server\share\Pulsaria\media\clip.mp4"
        )));
        assert!(is_network_path(Path::new(r"\\?\UNC\server\share\clip.mp4")));
        assert!(!is_network_path(Path::new(r"E:\Pulsaria\media\clip.mp4")));
        assert!(!is_network_path(Path::new(
            r"\\?\E:\Pulsaria\media\clip.mp4"
        )));
        assert!(validate_renderable_asset_path(Path::new(
            r"\\server\share\Pulsaria\media\clip.mp4"
        ))
        .is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlink_that_points_outside_the_media_directory() {
        use std::os::unix::fs::symlink;

        let root = test_root("symlink");
        let media = root.join("media");
        let outside = root.join("outside");
        fs::create_dir_all(&media).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let target = outside.join("private.mp4");
        let link = media.join("linked.mp4");
        fs::write(&target, b"synthetic private bytes").unwrap();
        symlink(&target, &link).unwrap();

        assert!(validate_renderable_asset_path(&link).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn rejects_a_symlink_that_points_outside_the_media_directory() {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            CreateSymbolicLinkW, SYMBOLIC_LINK_FLAG_ALLOW_UNPRIVILEGED_CREATE,
        };

        let root = test_root("symlink");
        let media = root.join("media");
        let outside = root.join("outside");
        fs::create_dir_all(&media).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let target = outside.join("private.mp4");
        let link = media.join("linked.mp4");
        fs::write(&target, b"synthetic private bytes").unwrap();

        let mut link_wide = link.as_os_str().encode_wide().collect::<Vec<_>>();
        link_wide.push(0);
        let mut target_wide = target.as_os_str().encode_wide().collect::<Vec<_>>();
        target_wide.push(0);
        let created = unsafe {
            CreateSymbolicLinkW(
                link_wide.as_ptr(),
                target_wide.as_ptr(),
                SYMBOLIC_LINK_FLAG_ALLOW_UNPRIVILEGED_CREATE,
            )
        };
        assert!(
            created,
            "Windows must permit an unprivileged synthetic symlink test"
        );

        assert!(validate_renderable_asset_path(&link).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
