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
        || normalized.contains("/favorite")
        || (normalized.contains("tiktok.com/@") && normalized.matches('/').count() <= 4);
    is_tiktok && !is_video && is_collection_path
}

#[cfg(test)]
mod tests {
    use super::{canonicalize_tiktok_url, is_collection_source};

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
}
