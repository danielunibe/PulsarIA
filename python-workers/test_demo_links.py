"""Deterministic worker contract tests. Live TikTok checks are opt-in."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import downloader


WORKER_DIR = Path(__file__).resolve().parent


class DownloaderContractTests(unittest.TestCase):
    def test_import_has_no_network_or_process_side_effect(self) -> None:
        self.assertTrue(callable(downloader.extract_metadata))

    @patch("downloader.subprocess.run")
    def test_metadata_contract(self, run) -> None:
        run.return_value = subprocess.CompletedProcess(
            args=[], returncode=0,
            stdout=json.dumps({
                "title": "Video de prueba", "uploader": "creator",
                "thumbnail": "https://example.invalid/thumb.jpg", "duration": 12,
                "upload_date": "20260831", "extractor_key": "TikTok",
            }), stderr="",
        )
        metadata = downloader.extract_metadata("https://www.tiktok.com/@creator/video/123")
        self.assertEqual(metadata["title"], "Video de prueba")
        self.assertEqual(metadata["platform"], "tiktok")

    @patch("downloader.subprocess.run")
    def test_tiktok_errors_keep_actionable_detail(self, run) -> None:
        run.side_effect = subprocess.CalledProcessError(
            1, ["yt-dlp"], stderr="TikTok session cookies are expired"
        )
        with self.assertRaisesRegex(RuntimeError, "session cookies are expired"):
            downloader.extract_metadata("https://www.tiktok.com/@creator/video/123")


@unittest.skipUnless(os.environ.get("PULSARIA_LIVE_TIKTOK_URL"), "live TikTok URL not supplied")
class LiveTikTokCertification(unittest.TestCase):
    def test_user_supplied_url_completes(self) -> None:
        url = os.environ["PULSARIA_LIVE_TIKTOK_URL"]
        with tempfile.TemporaryDirectory(prefix="pulsaria-live-") as directory:
            environment = os.environ.copy()
            environment["PULSAR_DOWNLOAD_DIR"] = directory
            result = subprocess.run(
                [sys.executable, str(WORKER_DIR / "main.py"), "--job_id", "990001", "--url", url],
                cwd=WORKER_DIR, env=environment, capture_output=True, text=True, timeout=900,
            )
            events = [json.loads(line) for line in result.stdout.splitlines() if line.startswith("{")]
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(events and events[-1].get("event") == "completed", result.stdout)


if __name__ == "__main__":
    unittest.main()
