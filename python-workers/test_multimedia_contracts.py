"""Offline regression tests for the Python multimedia slice.

The tests use temporary directories and fakes for FFmpeg/Whisper so they do
not download content, load a model, or depend on a user's Pulsaria data.
"""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import audio_extractor
import main
import transcriber
import visual_analyzer


class MultimediaDependencyTests(unittest.TestCase):
    def test_ffmpeg_missing_is_actionable_and_never_returns_bare_name(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with patch.object(audio_extractor, "_binary_roots", return_value=[]):
                with self.assertRaisesRegex(RuntimeError, r"FFmpeg.*FFMPEG_PATH"):
                    audio_extractor.resolve_ffmpeg_path()

    def test_ffprobe_missing_is_actionable_and_independent(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with patch.object(audio_extractor, "_binary_roots", return_value=[]):
                with self.assertRaisesRegex(RuntimeError, r"ffprobe.*FFPROBE_PATH"):
                    audio_extractor.resolve_ffprobe_path()

    def test_ffprobe_can_be_resolved_next_to_explicit_ffmpeg(self) -> None:
        with tempfile.TemporaryDirectory(prefix="pulsaria-binaries-test-") as directory:
            ffmpeg = Path(directory) / "ffmpeg.exe"
            ffprobe = Path(directory) / "ffprobe.exe"
            ffmpeg.write_bytes(b"ffmpeg")
            ffprobe.write_bytes(b"ffprobe")
            with patch.dict(os.environ, {}, clear=True):
                with patch.object(audio_extractor, "_binary_roots", return_value=[]):
                    self.assertEqual(
                        audio_extractor.resolve_ffprobe_path(str(ffmpeg)),
                        str(ffprobe),
                    )

    def test_extract_audio_does_not_spawn_when_ffmpeg_resolution_fails(self) -> None:
        with tempfile.TemporaryDirectory(prefix="pulsaria-audio-test-") as directory:
            video = Path(directory) / "video.mp4"
            video.write_bytes(b"not-a-real-video")
            with patch.object(
                audio_extractor,
                "resolve_ffmpeg_path",
                side_effect=RuntimeError("FFmpeg no está disponible; configura FFMPEG_PATH"),
            ):
                with patch("audio_extractor.subprocess.run") as run:
                    with self.assertRaisesRegex(RuntimeError, "FFmpeg no está disponible"):
                        audio_extractor.extract_audio(str(video))
                    run.assert_not_called()

    def test_main_preflight_stops_before_network_when_dependency_is_missing(self) -> None:
        with tempfile.TemporaryDirectory(prefix="pulsaria-main-test-") as directory:
            with patch.object(main, "processing_base_dir", return_value=Path(directory)):
                with patch.object(
                    main,
                    "resolve_ffmpeg_path",
                    side_effect=RuntimeError(
                        "FFmpeg no está disponible; configura FFMPEG_PATH"
                    ),
                ):
                    with patch.object(main, "resolve_ffprobe_path") as resolve_ffprobe:
                        with patch.object(main, "extract_metadata") as extract_metadata:
                            with patch.object(main, "emit_error") as emit_error:
                                main.process_single_job(17, "https://example.invalid/video")

            resolve_ffprobe.assert_not_called()
            extract_metadata.assert_not_called()
            emit_error.assert_called_once()
            self.assertIn("FFmpeg no está disponible", emit_error.call_args.args[0])

    def test_main_probes_duration_when_provider_returns_zero(self) -> None:
        with tempfile.TemporaryDirectory(prefix="pulsaria-main-duration-") as directory:
            root = Path(directory)
            video = root / "video.mp4"
            audio = root / "audio.mp3"
            video.write_bytes(b"video")
            audio.write_bytes(b"audio")
            observed: list[object] = []

            def fake_analyze(**kwargs):
                observed.append(kwargs["duration_seconds"])
                return {"instructional_guide": "", "frames": []}

            with patch.object(main, "processing_base_dir", return_value=root):
                with patch.object(main, "multimedia_preflight", return_value={"ffmpeg": "ffmpeg", "ffprobe": "ffprobe"}):
                    with patch.object(main, "emit_event"):
                        with patch.object(
                            main,
                            "extract_metadata",
                            return_value={"title": "Sin duración", "duration": 0},
                        ):
                            with patch.object(main, "download_video", return_value=str(video)):
                                with patch.object(main, "extract_audio", return_value=str(audio)):
                                    with patch.object(
                                        main,
                                        "transcribe_audio",
                                        return_value={"text": "", "segments": []},
                                    ):
                                        with patch.object(main, "generate_outputs", return_value=[]):
                                            with patch.object(main, "analyze_video", side_effect=fake_analyze):
                                                with patch.object(main, "emit_error") as emit_error:
                                                    main.process_single_job(18, "https://example.invalid/video")

            self.assertEqual(observed, [None])
            emit_error.assert_not_called()


class DurableVisualArtifactTests(unittest.TestCase):
    def test_visual_analysis_preserves_deterministic_poster_and_at_most_five_keyframes(self) -> None:
        with tempfile.TemporaryDirectory(prefix="pulsaria-visual-test-") as directory:
            root = Path(directory)
            video = root / "staging" / "42" / "video.mp4"
            video.parent.mkdir(parents=True)
            video.write_bytes(b"video-placeholder")
            artifacts = root / "app-data" / "artifacts"
            (artifacts / "42").mkdir(parents=True)
            manual = artifacts / "42" / "screenshot-01.jpg"
            manual.write_bytes(b"manual-capture")

            def fake_extract(
                _ffmpeg_path: str,
                _video_path: Path,
                _timestamp: float,
                output_path: Path,
            ) -> None:
                output_path.write_bytes(f"frame-{output_path.stem}".encode("ascii"))

            means = [
                [10, 10, 10],
                [12, 12, 12],
                [240, 240, 240],
                [20, 20, 20],
                [22, 22, 22],
                [230, 230, 230],
                [30, 30, 30],
                [32, 32, 32],
            ]

            def fake_stats(frame_path: Path) -> dict[str, object]:
                index = int(frame_path.stem.rsplit("-", 1)[1])
                mean = means[index]
                return {
                    "width": 640,
                    "height": 360,
                    "mean_rgb": mean,
                    "brightness": sum(mean) / 3,
                }

            patches = [
                patch.object(visual_analyzer, "_resolve_ffmpeg_path", return_value="ffmpeg"),
                patch.object(visual_analyzer, "_sample_times", return_value=list(range(8))),
                patch.object(visual_analyzer, "_extract_frame", side_effect=fake_extract),
                patch.object(visual_analyzer, "_image_statistics", side_effect=fake_stats),
                patch.object(visual_analyzer, "_resolve_tesseract_path", return_value=None),
            ]
            for active_patch in patches:
                active_patch.start()
            try:
                first = visual_analyzer.analyze_video(
                    str(video),
                    duration_seconds=8,
                    artifacts_dir=artifacts,
                    job_id=42,
                )
                second = visual_analyzer.analyze_video(
                    str(video),
                    duration_seconds=8,
                    artifacts_dir=artifacts,
                    job_id=42,
                )
            finally:
                for active_patch in reversed(patches):
                    active_patch.stop()

            self.assertEqual(first["poster_path"], second["poster_path"])
            self.assertEqual(first["keyframe_paths"], second["keyframe_paths"])
            keyframe_paths = [Path(path) for path in first["keyframe_paths"]]
            self.assertGreaterEqual(len(keyframe_paths), 1)
            self.assertLessEqual(len(keyframe_paths), 5)
            self.assertTrue(Path(first["poster_path"]).is_file())
            self.assertTrue(all(path.is_file() for path in keyframe_paths))
            self.assertTrue(manual.is_file(), "automatic retry must not delete manual captures")
            self.assertEqual(
                [artifact["kind"] for artifact in first["artifacts"]],
                ["poster", "keyframe", "keyframe", "keyframe", "keyframe", "keyframe"],
            )
            self.assertTrue(all("_temporary_path" not in frame for frame in first["frames"]))

    def test_visual_analysis_reports_missing_ffmpeg_before_frame_loop(self) -> None:
        with tempfile.TemporaryDirectory(prefix="pulsaria-visual-missing-") as directory:
            video = Path(directory) / "video.mp4"
            video.write_bytes(b"video-placeholder")
            with patch.object(
                visual_analyzer,
                "_resolve_ffmpeg_path",
                side_effect=RuntimeError("FFmpeg no está disponible; configura FFMPEG_PATH"),
            ):
                with self.assertRaisesRegex(RuntimeError, r"FFmpeg.*FFMPEG_PATH"):
                    visual_analyzer.analyze_video(str(video), duration_seconds=1)

    def test_duration_probe_requires_ffprobe_when_duration_is_unknown(self) -> None:
        with tempfile.TemporaryDirectory(prefix="pulsaria-probe-test-") as directory:
            video = Path(directory) / "video.mp4"
            video.write_bytes(b"video-placeholder")
            with patch.object(visual_analyzer, "_resolve_ffmpeg_path", return_value="ffmpeg"):
                with patch.object(
                    visual_analyzer,
                    "resolve_ffprobe_path",
                    side_effect=RuntimeError("ffprobe no está disponible; configura FFPROBE_PATH"),
                ):
                    with self.assertRaisesRegex(RuntimeError, r"ffprobe.*FFPROBE_PATH"):
                        visual_analyzer.analyze_video(str(video), duration_seconds=None)


class DurableTranscriptTests(unittest.TestCase):
    def _fake_model(self, segments: list[object]):
        info = SimpleNamespace(language="es", duration=12.34)

        class FakeModel:
            def transcribe(self, _audio_path: str, **_kwargs):
                return iter(segments), info

        return FakeModel()

    def test_transcript_writes_durable_copy_and_legacy_compatibility_copy(self) -> None:
        segment = SimpleNamespace(
            start=0.0,
            end=1.5,
            text="  Hola Pulsaria  ",
            words=None,
        )
        with tempfile.TemporaryDirectory(prefix="pulsaria-transcript-test-") as directory:
            root = Path(directory)
            audio = root / "media" / "processing" / "73" / "audio.mp3"
            audio.parent.mkdir(parents=True)
            audio.write_bytes(b"audio-placeholder")
            data_dir = root / "app-data"
            with patch.dict(
                os.environ,
                {
                    "PULSAR_DATA_DIR": str(data_dir),
                    "PULSAR_DOWNLOAD_DIR": str(root / "media"),
                },
                clear=True,
            ):
                with patch.object(transcriber, "get_model", return_value=self._fake_model([segment])):
                    result = transcriber.transcribe_audio(str(audio), job_id=73)

            durable = data_dir / "transcripts" / "73.txt"
            legacy = audio.parent / "transcript.txt"
            self.assertEqual(Path(result["transcript_path"]), durable)
            # Windows may expose the same temporary directory through its
            # long path or its 8.3 short-path alias. Compare canonical paths
            # so the contract validates the adjacent artifact, not spelling.
            self.assertEqual(
                Path(result["legacy_transcript_path"]).resolve(), legacy.resolve()
            )
            self.assertEqual(durable.read_text(encoding="utf-8"), "Hola Pulsaria")
            self.assertEqual(legacy.read_text(encoding="utf-8"), "Hola Pulsaria")

    def test_empty_transcript_still_creates_durable_marker(self) -> None:
        with tempfile.TemporaryDirectory(prefix="pulsaria-empty-transcript-") as directory:
            root = Path(directory)
            audio = root / "processing" / "74" / "audio.mp3"
            audio.parent.mkdir(parents=True)
            audio.write_bytes(b"audio-placeholder")
            data_dir = root / "app-data"
            with patch.dict(os.environ, {"PULSAR_DATA_DIR": str(data_dir)}, clear=True):
                with patch.object(transcriber, "get_model", return_value=self._fake_model([])):
                    result = transcriber.transcribe_audio(str(audio), job_id=74)

            self.assertEqual(result["text"], "")
            self.assertEqual(result["segments"], [])
            self.assertTrue(Path(result["transcript_path"]).is_file())
            self.assertTrue(Path(result["legacy_transcript_path"]).is_file())
            self.assertEqual(Path(result["transcript_path"]).read_text(encoding="utf-8"), "")

    def test_standalone_worker_uses_canonical_app_data_and_honors_legacy_root(self) -> None:
        with tempfile.TemporaryDirectory(prefix="pulsaria-app-data-contract-") as directory:
            base = Path(directory)
            with patch.dict(os.environ, {"LOCALAPPDATA": str(base)}, clear=True):
                self.assertEqual(
                    transcriber._default_transcripts_root(base / "project"),
                    base / "Pulsar Eventide" / "transcripts",
                )
                self.assertEqual(
                    transcriber._writable_model_cache(base / "project"),
                    base / "Pulsar Eventide" / "whisper-models",
                )

            (base / "Pulsaria").mkdir()
            with patch.dict(os.environ, {"LOCALAPPDATA": str(base)}, clear=True):
                self.assertEqual(
                    transcriber._default_transcripts_root(base / "project"),
                    base / "Pulsaria" / "transcripts",
                )


if __name__ == "__main__":
    unittest.main()
