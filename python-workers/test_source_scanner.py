import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from source_scanner import scan_tiktok_source


class SourceScannerTests(unittest.TestCase):
    def test_scans_requested_categories_without_downloading(self):
        def entries_for(url, _limit):
            suffix = url.rsplit("/", 1)[-1]
            video_id = {"liked": "101", "saved": "102", "reposts": "103"}.get(suffix, "100")
            return [{
                "url": f"https://www.tiktok.com/@creator/video/{video_id}",
                "id": video_id,
                "upload_date": "20260919",
                "timestamp": None,
            }]

        with patch("source_scanner.extract_playlist_entries", side_effect=entries_for) as extractor:
            result = scan_tiktok_source(
                "https://www.tiktok.com/@creator",
                ["posts", "likes", "saved", "reposts"],
                limit=25,
            )

        self.assertEqual(set(result["categories"]), {"posts", "likes", "saved", "reposts"})
        self.assertTrue(all(item["available"] for item in result["categories"].values()))
        self.assertEqual(extractor.call_count, 4)
        self.assertEqual(result["profile"]["username"], "@creator")

    def test_deduplicates_tracking_variants_and_rejects_non_tiktok_entries(self):
        entries = [
            {"url": "https://www.tiktok.com/@creator/video/100?is_from_webapp=1", "id": "100"},
            {"url": "https://tiktok.com/@creator/video/100#share", "id": "100"},
            {"url": "https://www.youtube.com/watch?v=external", "id": "external"},
            {"url": "https://www.tiktok.com/@creator", "id": "profile"},
        ]
        with patch("source_scanner.extract_playlist_entries", return_value=entries):
            result = scan_tiktok_source("https://www.tiktok.com/@creator", ["posts"])

        items = result["categories"]["posts"]["items"]
        self.assertEqual(len(items), 1)
        self.assertIn("/video/100", items[0]["url"])

    def test_authentication_error_is_actionable(self):
        with patch(
            "source_scanner.extract_playlist_entries",
            side_effect=RuntimeError("TikTok requiere login/cookies para esta actividad"),
        ):
            result = scan_tiktok_source("https://www.tiktok.com/@creator", ["likes"])

        category = result["categories"]["likes"]
        self.assertFalse(category["available"])
        self.assertTrue(category["auth_required"])
        self.assertIn("cookies", category["reason"])

    def test_empty_result_is_available_and_distinct_from_error(self):
        with patch("source_scanner.extract_playlist_entries", return_value=[]):
            result = scan_tiktok_source("https://www.tiktok.com/@creator", ["saved"])

        category = result["categories"]["saved"]
        self.assertTrue(category["available"])
        self.assertEqual(category["items"], [])
        self.assertIsNone(category["reason"])

    def test_history_date_filters_older_entries(self):
        entries = [
            {"url": "https://www.tiktok.com/@creator/video/old", "upload_date": "20260101"},
            {"url": "https://www.tiktok.com/@creator/video/new", "upload_date": "20260920"},
        ]
        with patch("source_scanner.extract_playlist_entries", return_value=entries):
            result = scan_tiktok_source(
                "https://www.tiktok.com/@creator",
                ["posts"],
                history_from="2026-09-01",
            )

        self.assertEqual(
            [item["url"] for item in result["categories"]["posts"]["items"]],
            ["https://www.tiktok.com/@creator/video/new"],
        )


if __name__ == "__main__":
    unittest.main()
