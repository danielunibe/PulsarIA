"""Offline contract tests for the selected output format pipeline."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from output_generator import ALL_FORMATS, generate_outputs, normalize_formats


class OutputFormatTests(unittest.TestCase):
    def test_normalize_formats_deduplicates_and_rejects_unknown_values(self) -> None:
        self.assertEqual(normalize_formats(["MP4", "mp4", "txt"]), ["mp4", "txt"])
        with self.assertRaisesRegex(ValueError, "no compatible"):
            normalize_formats(["avi"])

    @patch("output_generator.resolve_ffmpeg_path", return_value="ffmpeg")
    @patch("output_generator.subprocess.run")
    def test_all_selected_formats_are_generated_and_validated(self, run, _resolve) -> None:
        def create_output(command, **_kwargs):
            Path(command[-1]).write_bytes(b"generated")

        run.side_effect = create_output
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            video = root / "video.mp4"
            audio = root / "audio.mp3"
            video.write_bytes(b"video")
            audio.write_bytes(b"audio")
            outputs = generate_outputs(
                video,
                audio,
                "Texto de prueba",
                [{"start": 0.0, "end": 1.25, "text": "Texto de prueba"}],
                {"title": "Prueba", "duration": 1},
                ALL_FORMATS,
                root / "exports",
            )
            self.assertEqual({output["format"] for output in outputs}, set(ALL_FORMATS))
            self.assertTrue(all(output["validated"] for output in outputs))
            self.assertTrue(all(Path(output["path"]).is_file() for output in outputs))
            self.assertIn("WEBVTT", (root / "exports" / "text.vtt").read_text(encoding="utf-8"))
            self.assertIn('"schemaVersion": 1', (root / "exports" / "text.json").read_text(encoding="utf-8"))

    @patch("output_generator.resolve_ffmpeg_path", return_value="ffmpeg")
    @patch("output_generator.subprocess.run")
    def test_empty_transcript_keeps_text_exports_valid(self, run, _resolve) -> None:
        def create_output(command, **_kwargs):
            Path(command[-1]).write_bytes(b"generated")

        run.side_effect = create_output
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            video = root / "video.mp4"
            audio = root / "audio.mp3"
            video.write_bytes(b"video")
            audio.write_bytes(b"audio")
            outputs = generate_outputs(
                video,
                audio,
                "",
                [],
                {"title": "Sin transcript", "duration": 1},
                ["txt", "srt", "vtt", "json"],
                root / "exports",
            )
            self.assertEqual({output["format"] for output in outputs}, {"txt", "srt", "vtt", "json"})
            self.assertTrue((root / "exports" / "text.txt").is_file())
            self.assertEqual((root / "exports" / "text.txt").stat().st_size, 0)
            self.assertIn("WEBVTT", (root / "exports" / "text.vtt").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
