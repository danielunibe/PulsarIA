//! Allowlist for links opened outside the desktop WebView.

use url::Url;

const TIKTOK_HOSTS: [&str; 5] = [
    "tiktok.com",
    "www.tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com",
    "m.tiktok.com",
];

const LEGAL_GITHUB_PATHS: [&str; 9] = [
    "/danielunibe/PulsarIA/blob/main/EULA.es.md",
    "/danielunibe/PulsarIA/blob/main/EULA.en.md",
    "/danielunibe/PulsarIA/blob/main/TERMS_OF_USE.es.md",
    "/danielunibe/PulsarIA/blob/main/TERMS_OF_USE.en.md",
    "/danielunibe/PulsarIA/blob/main/PRIVACY.es.md",
    "/danielunibe/PulsarIA/blob/main/PRIVACY.en.md",
    "/danielunibe/PulsarIA/blob/main/CONTENT_POLICY.es.md",
    "/danielunibe/PulsarIA/blob/main/CONTENT_POLICY.en.md",
    "/danielunibe/PulsarIA/blob/main/SECURITY.md",
];

pub fn validate_external_url(value: &str) -> Result<Url, &'static str> {
    if value.trim() != value || value.len() > 2048 {
        return Err("El enlace externo no es válido.");
    }
    let authority = value
        .split_once("://")
        .map(|(_, remainder)| remainder.split(['/', '?', '#']).next().unwrap_or_default())
        .unwrap_or_default();
    if authority.contains('@') || authority.contains(':') {
        return Err("El enlace externo no está autorizado.");
    }
    let url = Url::parse(value).map_err(|_| "El enlace externo no es válido.")?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("El enlace externo no está autorizado.");
    }

    let host = url.host_str().unwrap_or_default();
    let is_tiktok = TIKTOK_HOSTS.contains(&host);
    let is_legal_github = host == "github.com"
        && url.query().is_none()
        && url.fragment().is_none()
        && LEGAL_GITHUB_PATHS.contains(&url.path());
    if is_tiktok || is_legal_github {
        Ok(url)
    } else {
        Err("El dominio o documento externo no está autorizado.")
    }
}

#[cfg(test)]
mod tests {
    use super::validate_external_url;

    #[test]
    fn allows_official_tiktok_and_known_legal_documents() {
        for value in [
            "https://www.tiktok.com/@creator/video/123",
            "https://vm.tiktok.com/ZExample",
            "https://vt.tiktok.com/ZExample",
            "https://m.tiktok.com/@creator/video/123",
            "https://tiktok.com/@creator",
            "https://github.com/danielunibe/PulsarIA/blob/main/PRIVACY.es.md",
            "https://github.com/danielunibe/PulsarIA/blob/main/SECURITY.md",
        ] {
            assert!(validate_external_url(value).is_ok(), "{value}");
        }
    }

    #[test]
    fn rejects_untrusted_hosts_paths_schemes_ports_and_credentials() {
        for value in [
            "https://example.com/",
            "https://tiktok.com.evil.example/@creator",
            "https://evil.tiktok.com/@creator",
            "https://github.com/other/repo/blob/main/PRIVACY.es.md",
            "https://github.com/danielunibe/PulsarIA/blob/main/README.md",
            "https://github.com/danielunibe/PulsarIA/blob/main/PRIVACY.es.md?download=1",
            "https://user:password@www.tiktok.com/@creator/video/123",
            "https://www.tiktok.com:444/@creator/video/123",
            "https://www.tiktok.com:443/@creator/video/123",
            "https://@www.tiktok.com/@creator/video/123",
            "https://www.tiktok.com./@creator/video/123",
            "http://www.tiktok.com/@creator/video/123",
            "javascript:alert(1)",
            " https://www.tiktok.com/@creator/video/123",
        ] {
            assert!(validate_external_url(value).is_err(), "{value}");
        }
    }
}
