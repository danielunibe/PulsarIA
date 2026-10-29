import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from source_scanner import scan_tiktok_source


class SourceScannerTests(unittest.TestCase):
    def test_all_available_does_not_truncate_inventory_to_a_fixed_batch(self):
        entries = [{"url": f"https://www.tiktok.com/@creator/video/{index}", "id": str(index)} for index in range(1200)]
        with patch("source_scanner.profile_identity", return_value={}), patch("source_scanner.extract_playlist_entries", return_value=entries) as extractor:
            result = scan_tiktok_source("https://www.tiktok.com/@creator", ["posts"], limit=0)
        extractor.assert_called_once_with("https://www.tiktok.com/@creator", 0)
        self.assertEqual(len(result["categories"]["posts"]["items"]), 1200)
        self.assertFalse(result["categories"]["posts"]["truncated"])

    def test_requested_limits_are_applied_and_mark_full_batches_as_truncated(self):
        entries = [
            {"url": f"https://www.tiktok.com/@creator/video/{index}", "id": str(index)}
            for index in range(120)
        ]
        for limit in (20, 50, 100):
            with self.subTest(limit=limit), patch(
                "source_scanner.profile_identity", return_value={"private_account": False}
            ), patch("source_scanner.extract_playlist_entries", return_value=entries):
                category = scan_tiktok_source(
                    "https://www.tiktok.com/@creator", ["posts"], limit=limit
                )["categories"]["posts"]
            self.assertEqual(len(category["items"]), limit)
            self.assertTrue(category["truncated"])

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

    def test_empty_private_or_visibility_unconfirmed_categories_do_not_claim_zero(self):
        for category_name in ("posts", "likes", "saved", "reposts"):
            with self.subTest(category=category_name), patch(
                "source_scanner.profile_identity", return_value={"private_account": None}
            ), patch("source_scanner.extract_playlist_entries", return_value=[]):
                result = scan_tiktok_source(
                    "https://www.tiktok.com/@creator", [category_name]
                )

            category = result["categories"][category_name]
            self.assertFalse(category["available"])
            self.assertEqual(category["status"], "unknown")
            self.assertEqual(category["items"], [])
            self.assertIn("sin confirmar", category["reason"])

    def test_empty_public_posts_can_be_a_confirmed_zero_but_private_activity_cannot(self):
        with patch(
            "source_scanner.profile_identity", return_value={"private_account": False}
        ), patch("source_scanner.extract_playlist_entries", return_value=[]):
            posts = scan_tiktok_source(
                "https://www.tiktok.com/@creator", ["posts"]
            )["categories"]["posts"]
            saved = scan_tiktok_source(
                "https://www.tiktok.com/@creator", ["saved"]
            )["categories"]["saved"]

        self.assertTrue(posts["available"])
        self.assertEqual(posts["status"], "available")
        self.assertFalse(saved["available"])
        self.assertEqual(saved["status"], "unknown")

    def test_generic_private_category_failure_is_concrete_without_asserting_auth_or_support(self):
        with patch(
            "source_scanner.extract_playlist_entries",
            side_effect=RuntimeError("temporary provider failure"),
        ):
            category = scan_tiktok_source(
                "https://www.tiktok.com/@creator", ["likes"]
            )["categories"]["likes"]

        self.assertFalse(category["available"])
        self.assertEqual(category["status"], "error")
        self.assertFalse(category["auth_required"])
        self.assertIn("temporary provider failure", category["reason"])

    def test_explicit_unsupported_category_is_not_misreported_as_auth_required(self):
        with patch(
            "source_scanner.extract_playlist_entries",
            side_effect=RuntimeError("Unsupported URL: /@creator/reposts"),
        ):
            category = scan_tiktok_source(
                "https://www.tiktok.com/@creator", ["reposts"]
            )["categories"]["reposts"]

        self.assertFalse(category["available"])
        self.assertEqual(category["status"], "unsupported")
        self.assertFalse(category["auth_required"])

    def test_history_date_filters_older_entries(self):
        entries = [
            {"url": "https://www.tiktok.com/@creator/video/old", "upload_date": "20260101"},
            {"url": "https://www.tiktok.com/@creator/video/new", "upload_date": "20260920"},
            {"url": "https://www.tiktok.com/@creator/video/undated", "upload_date": None},
        ]
        with patch("source_scanner.extract_playlist_entries", return_value=entries):
            result = scan_tiktok_source(
                "https://www.tiktok.com/@creator",
                ["posts"],
                history_from="2026-09-01",
            )

        self.assertEqual(
            [item["url"] for item in result["categories"]["posts"]["items"]],
            [
                "https://www.tiktok.com/@creator/video/new",
                "https://www.tiktok.com/@creator/video/undated",
            ],
        )

    def test_rate_limit_and_captcha_are_visible_capability_states(self):
        for error in ("HTTP 429 too many requests", "TikTok captcha challenge"):
            with self.subTest(error=error), patch(
                "source_scanner.extract_playlist_entries",
                side_effect=RuntimeError(error),
            ):
                category = scan_tiktok_source(
                    "https://www.tiktok.com/@creator", ["posts"]
                )["categories"]["posts"]
            self.assertFalse(category["available"])
            self.assertEqual(category["status"], "rate_limited")
            self.assertIn("limitó", category["reason"])


if __name__ == "__main__":
    unittest.main()
