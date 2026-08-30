/// Shared URL classification utilities for Pulsaria.
///
/// `is_collection_source` determines whether a URL points to a TikTok
/// collection (profile page, playlist, liked videos) rather than a
/// single video. Used by both the Tauri IPC path and the REST API gateway.

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
    use super::is_collection_source;

    #[test]
    fn detects_tiktok_collections() {
        assert!(is_collection_source("https://www.tiktok.com/@creator"));
        assert!(is_collection_source("https://www.tiktok.com/@creator/playlists/123"));
        assert!(is_collection_source("https://www.tiktok.com/@creator/liked"));
        assert!(is_collection_source("https://www.tiktok.com/@creator/favorite"));
    }

    #[test]
    fn rejects_single_videos() {
        assert!(!is_collection_source("https://www.tiktok.com/@creator/video/123"));
        assert!(!is_collection_source("https://www.youtube.com/watch?v=abc"));
    }

    #[test]
    fn rejects_non_tiktok() {
        assert!(!is_collection_source("https://www.instagram.com/reel/abc"));
    }
}
