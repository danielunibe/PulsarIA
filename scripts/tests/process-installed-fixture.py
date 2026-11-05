"""Run the packaged transcription and visual-analysis modules on a test fixture."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--resource-root", required=True)
    parser.add_argument("--video-path", required=True)
    parser.add_argument("--transcript-dir", required=True)
    parser.add_argument("--artifacts-dir", required=True)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    resource_root = Path(args.resource_root).resolve()
    video_path = Path(args.video_path).resolve()
    transcript_dir = Path(args.transcript_dir).resolve()
    artifacts_dir = Path(args.artifacts_dir).resolve()
    output_path = Path(args.output).resolve()
    workers_dir = resource_root / "python-workers"
    if not video_path.is_file() or not workers_dir.is_dir():
        raise RuntimeError("The synthetic video or installed worker modules are missing")

    sys.path.insert(0, str(workers_dir))
    from audio_extractor import extract_audio
    import transcriber
    from visual_analyzer import analyze_video

    os.environ["PULSAR_RUNTIME_ROOT"] = str(resource_root)
    os.environ["PULSAR_DOWNLOAD_DIR"] = str(video_path.parent)
    os.environ["PULSAR_TRANSCRIPTS_DIR"] = str(transcript_dir)
    os.environ["PULSAR_ARTIFACTS_DIR"] = str(artifacts_dir)
    os.environ["WHISPER_MODEL"] = "tiny"
    os.environ["WHISPER_DEVICE"] = "cpu"
    os.environ["WHISPER_COMPUTE_TYPE"] = "int8"

    model_dir = transcriber._local_model_directory(
        "tiny", Path(transcriber.__file__).resolve().parent.parent
    )
    if model_dir is None:
        raise RuntimeError("The packaged Whisper tiny model could not be resolved locally")
    os.environ["PULSAR_WHISPER_MODEL_DIR"] = str(model_dir)

    audio_path = Path(extract_audio(str(video_path))).resolve()
    transcript = transcriber.transcribe_audio(
        str(audio_path), transcript_dir=transcript_dir, job_id=args.job_id
    )
    text = str(transcript.get("text", "")).strip()
    segments = transcript.get("segments") or []
    if not text or not segments:
        raise RuntimeError("Packaged Whisper returned no transcript for the spoken fixture")

    analysis = analyze_video(
        str(video_path),
        duration_seconds=None,
        transcript=text,
        artifacts_dir=artifacts_dir,
        job_id=args.job_id,
    )
    artifacts = analysis.get("artifacts") or []
    keyframes = [
        item
        for item in artifacts
        if item.get("kind") == "keyframe"
        and Path(str(item.get("path", ""))).is_file()
    ]
    if not keyframes:
        raise RuntimeError("Packaged visual analysis produced no persisted keyframe")

    query_tokens = re.findall(r"[A-Za-z]{4,}", text)
    if not query_tokens:
        raise RuntimeError("Packaged Whisper transcript has no searchable token")

    payload = {
        "transcript": text,
        "segments": segments,
        "language": transcript.get("language"),
        "duration": transcript.get("duration"),
        "audioPath": str(audio_path),
        "visualAnalysis": analysis,
        "searchQuery": query_tokens[0],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(
        json.dumps(
            {
                "transcribed": True,
                "language": payload["language"],
                "segmentCount": len(segments),
                "frameCount": analysis.get("successful_frame_count", 0),
                "artifactCount": len(artifacts),
                "searchQueryPresent": True,
            },
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001 - emit one sanitized smoke failure
        print(json.dumps({"error": str(error)}, separators=(",", ":")), file=sys.stderr)
        raise SystemExit(1)
