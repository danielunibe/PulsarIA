// Shared URL classification utilities for Pulsaria.
// `is_collection_source` determines whether a URL points to a TikTok
// collection (profile page, playlist, liked videos) rather than a
// single video. Used by both the Tauri IPC path and the REST API gateway.

/// Produces the stable form used for persistence and deduplication.
/// Tracking parameters and fragments never identify a different TikTok item.
pub fn canonicalize_tiktok_url(input: &str) -> String {
    let without_fragment = input.trim().split('#').next().unwrap_or(input.trim());
    let without_query = without_fragment
        .split('?')
        .next()
        .unwrap_or(without_fragment);
    let trimmed = without_query.trim_end_matches('/');
    let Some((scheme, remainder)) = trimmed.split_once("://") else {
        return trimmed.to_string();
    };
    let (authority, path) = remainder.split_once('/').unwrap_or((remainder, ""));
    let host = authority.to_ascii_lowercase();
    let canonical_host = if host == "tiktok.com" {
        "www.tiktok.com"
    } else {
        host.as_str()
    };
    if path.is_empty() {
        format!("{}://{}", scheme.to_ascii_lowercase(), canonical_host)
    } else {
        format!(
            "{}://{}/{}",
            scheme.to_ascii_lowercase(),
            canonical_host,
            path
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TikTokProfileIdentity {
    pub canonical_url: String,
    pub username: String,
    pub handle: String,
}

fn valid_profile_username(username: &str) -> bool {
    !username.is_empty()
        && username.len() <= 24
        && username
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '.' | '_'))
}

/// Normalizes the profile-only input accepted by the registration flow.
/// Activity paths and video URLs are intentionally rejected here; they belong
/// to the existing collection scanner contract, not to profile identity.
pub fn normalize_tiktok_profile_input(input: &str) -> Option<TikTokProfileIdentity> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let username = if let Some(handle) = trimmed.strip_prefix('@') {
        if handle.contains('/') || handle.contains('?') || handle.contains('#') {
            return None;
        }
        handle.to_string()
    } else {
        let canonical = canonicalize_tiktok_url(trimmed);
        let username_with_marker = canonical.strip_prefix("https://www.tiktok.com/@")?;
        if username_with_marker.contains('/') {
            return None;
        }
        username_with_marker.to_string()
    };

    if !valid_profile_username(&username) {
        return None;
    }

    let handle = format!("@{username}");
    Some(TikTokProfileIdentity {
        canonical_url: format!("https://www.tiktok.com/{handle}"),
        username,
        handle,
    })
}

/// Returns the canonical profile URL for a TikTok profile or one of the
/// activity collections attached to it.
pub fn tiktok_profile_url(input: &str) -> Option<String> {
    let canonical = canonicalize_tiktok_url(input);
    let marker = "https://www.tiktok.com/@";
    let username_with_path = canonical.strip_prefix(marker)?;
    let username = username_with_path
        .split('/')
        .next()
        .filter(|value| !value.is_empty())?;
    if !valid_profile_username(username) {
        return None;
    }
    Some(format!("{marker}{username}"))
}

pub fn tiktok_username(input: &str) -> Option<String> {
    tiktok_profile_url(input).and_then(|profile| {
        profile
            .strip_prefix("https://www.tiktok.com/")
            .map(str::to_string)
    })
}

/// Returns `true` if the URL is a TikTok collection source
/// (profile page, playlist, liked videos, etc.) rather than a single video.
///
/// A collection URL:
/// - Contains `tiktok.com/`
/// - Does NOT contain `/video/` (which indicates a single video)
/// - Contains collection indicators: `/playlist`, `/playlists/`, `/liked`,
///   `/favorite`, or is a profile page with ≤4 path segments
pub fn is_collection_source(url: &str) -> bool {
    let normalized = url.to_ascii_lowercase();
    let is_tiktok = normalized.contains("tiktok.com/");
    let is_video = normalized.contains("/video/");
    let is_collection_path = normalized.contains("/playlist")
        || normalized.contains("/playlists/")
        || normalized.contains("/liked")
        || normalized.contains("/saved")
        || normalized.contains("/reposts")
        || normalized.contains("/favorite")
        || (normalized.contains("tiktok.com/@") && normalized.matches('/').count() <= 4);
    is_tiktok && !is_video && is_collection_path
}

#[cfg(test)]
mod tests {
    use super::{
        canonicalize_tiktok_url, is_collection_source, normalize_tiktok_profile_input,
        tiktok_profile_url, tiktok_username,
    };

    #[test]
    fn normalizes_profile_handles_and_www_variants() {
        let handle = normalize_tiktok_profile_input(" @usuario ").unwrap();
        let www = normalize_tiktok_profile_input("https://www.tiktok.com/@usuario/").unwrap();
        let bare = normalize_tiktok_profile_input("https://tiktok.com/@usuario?lang=es").unwrap();

        assert_eq!(handle.canonical_url, "https://www.tiktok.com/@usuario");
        assert_eq!(handle, www);
        assert_eq!(www, bare);
    }

    #[test]
    fn rejects_non_profile_inputs() {
        assert!(
            normalize_tiktok_profile_input("https://www.tiktok.com/@usuario/video/1").is_none()
        );
        assert!(normalize_tiktok_profile_input("https://example.com/@usuario").is_none());
        assert!(normalize_tiktok_profile_input("usuario").is_none());
        assert!(normalize_tiktok_profile_input("@").is_none());
    }

    #[test]
    fn canonicalizes_tracking_variants_for_deduplication() {
        assert_eq!(
            canonicalize_tiktok_url(
                "HTTPS://tiktok.com/@creator/video/123/?is_from_webapp=1#share"
            ),
            "https://www.tiktok.com/@creator/video/123"
        );
    }

    #[test]
    fn detects_tiktok_collections() {
        assert!(is_collection_source("https://www.tiktok.com/@creator"));
        assert!(is_collection_source(
            "https://www.tiktok.com/@creator/playlists/123"
        ));
        assert!(is_collection_source(
            "https://www.tiktok.com/@creator/liked"
        ));
        assert!(is_collection_source(
            "https://www.tiktok.com/@creator/favorite"
        ));
    }

    #[test]
    fn rejects_single_videos() {
        assert!(!is_collection_source(
            "https://www.tiktok.com/@creator/video/123"
        ));
        assert!(!is_collection_source("https://www.youtube.com/watch?v=abc"));
    }

    #[test]
    fn rejects_non_tiktok() {
        assert!(!is_collection_source("https://www.instagram.com/reel/abc"));
    }

    #[test]
    fn derives_profile_from_supported_activity_urls() {
        assert_eq!(
            tiktok_profile_url("https://tiktok.com/@creator/liked?lang=es"),
            Some("https://www.tiktok.com/@creator".to_string())
        );
        assert_eq!(
            tiktok_username("https://www.tiktok.com/@creator"),
            Some("@creator".into())
        );
    }
}
