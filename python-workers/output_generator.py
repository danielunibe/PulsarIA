"""Generate the user-selected Pulsaria output formats.

The processing pipeline keeps MP4/MP3 as private canonical intermediates for
Whisper and compatibility with the Rust library. This module creates the
selected exports in the same staging job directory and returns a small,
stable manifest that Rust promotes and registers after a successful job.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from audio_extractor import resolve_ffmpeg_path


VIDEO_FORMATS = ("mp4", "mkv", "webm", "mov")
AUDIO_FORMATS = ("mp3", "wav", "flac", "ogg", "m4a")
TEXT_FORMATS = ("txt", "srt", "vtt", "json")
ALL_FORMATS = VIDEO_FORMATS + AUDIO_FORMATS + TEXT_FORMATS


def normalize_formats(value: Any) -> list[str]:
    """Validate and de-duplicate the configured output formats."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as error:
            raise ValueError(f"PULSAR_FORMATS no contiene JSON válido: {error}") from error
    if not isinstance(value, (list, tuple)):
        raise ValueError("PULSAR_FORMATS debe ser una lista")
    result: list[str] = []
    for raw in value:
        if not isinstance(raw, str):
            raise ValueError("PULSAR_FORMATS contiene un valor no textual")
        format_name = raw.strip().lower()
        if format_name not in ALL_FORMATS:
            raise ValueError(f"Formato de salida no compatible: {format_name}")
        if format_name not in result:
            result.append(format_name)
    if not result:
        raise ValueError("Selecciona al menos un formato de salida")
    return result


def _run_ffmpeg(command: list[str], output: Path) -> None:
    try:
        subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=max(30.0, min(float(os.environ.get("PULSAR_OUTPUT_TIMEOUT_SECONDS", "900")), 3600.0)),
        )
    except subprocess.CalledProcessError as error:
        detail = error.stderr.strip() if error.stderr else str(error)
        raise RuntimeError(f"FFmpeg no pudo generar {output.name}: {detail[-600:]}") from error
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"FFmpeg excedió el tiempo al generar {output.name}") from error
    except OSError as error:
        raise RuntimeError(f"FFmpeg no está disponible para generar {output.name}: {error}") from error
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError(f"FFmpeg terminó sin producir {output}")


def _temporary_output(destination: Path) -> Path:
    return destination.with_name(f".{destination.name}.{os.getpid()}.part")


def _copy_output(source: Path, destination: Path) -> None:
    temporary = _temporary_output(destination)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def _video_export(source: Path, destination: Path, format_name: str) -> None:
    if format_name == "mp4" and source.suffix.lower() == ".mp4":
        _copy_output(source, destination)
        return
    ffmpeg = resolve_ffmpeg_path()
    temporary = _temporary_output(destination)
    codecs = {
        "mp4": ["-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart"],
        "mkv": ["-c", "copy"],
        "webm": ["-c:v", "libvpx-vp9", "-c:a", "libopus"],
        "mov": ["-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart"],
    }
    try:
        _run_ffmpeg([ffmpeg, "-i", str(source), "-y", *codecs[format_name], str(temporary)], temporary)
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def _audio_export(source: Path, destination: Path, format_name: str) -> None:
    if format_name == "mp3" and source.suffix.lower() == ".mp3":
        _copy_output(source, destination)
        return
    ffmpeg = resolve_ffmpeg_path()
    temporary = _temporary_output(destination)
    codecs = {
        "wav": ["-c:a", "pcm_s16le"],
        "flac": ["-c:a", "flac"],
        "ogg": ["-c:a", "libvorbis"],
        "m4a": ["-c:a", "aac"],
    }
    try:
        _run_ffmpeg([ffmpeg, "-i", str(source), "-vn", "-y", *codecs[format_name], str(temporary)], temporary)
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def _timestamp(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    remainder = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{remainder:06.3f}".replace(".", ",")


def _write_text_output(destination: Path, format_name: str, text: str, segments: list[dict[str, Any]], metadata: dict[str, Any]) -> None:
    if format_name == "txt":
        content = text
    elif format_name == "srt":
        content = "\n\n".join(
            f"{index}\n{_timestamp(segment.get('start', 0))} --> {_timestamp(segment.get('end', 0))}\n{str(segment.get('text', '')).strip()}"
            for index, segment in enumerate(segments, start=1)
            if str(segment.get("text", "")).strip()
        ) + ("\n" if segments else "")
    elif format_name == "vtt":
        cues = "\n\n".join(
            f"{_timestamp(segment.get('start', 0)).replace(',', '.')} --> {_timestamp(segment.get('end', 0)).replace(',', '.')}\n{str(segment.get('text', '')).strip()}"
            for segment in segments
            if str(segment.get("text", "")).strip()
        )
        content = "WEBVTT\n\n" + cues + ("\n" if cues else "")
    else:
        content = json.dumps(
            {"schemaVersion": 1, "metadata": metadata, "text": text, "segments": segments},
            ensure_ascii=False,
            indent=2,
        ) + "\n"
    temporary = _temporary_output(destination)
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary.write_text(content, encoding="utf-8", newline="\n")
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def generate_outputs(
    video_path: str | Path,
    audio_path: str | Path,
    transcript: str,
    segments: list[dict[str, Any]],
    metadata: dict[str, Any],
    formats: Any,
    output_dir: str | Path,
) -> list[dict[str, Any]]:
    """Generate and validate all configured outputs for one job."""
    selected = normalize_formats(formats)
    video = Path(video_path).resolve()
    audio = Path(audio_path).resolve()
    root = Path(output_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    outputs: list[dict[str, Any]] = []
    for format_name in selected:
        category = "video" if format_name in VIDEO_FORMATS else "audio" if format_name in AUDIO_FORMATS else "text"
        source = video if category == "video" else audio
        destination = root / f"{category}.{format_name}"
        if category == "video":
            _video_export(source, destination, format_name)
        elif category == "audio":
            _audio_export(source, destination, format_name)
        else:
            _write_text_output(destination, format_name, transcript, segments, metadata)
        # An empty transcript is a valid knowledge result. Text exports must
        # still be durable files, even when they contain zero bytes; media
        # exports remain fail-closed because an empty MP4/MP3 is never usable.
        output_is_empty = destination.stat().st_size == 0 if destination.is_file() else True
        if not destination.is_file() or (output_is_empty and category != "text"):
            raise RuntimeError(f"La salida seleccionada {destination.name} no es válida")
        outputs.append({
            "category": category,
            "format": format_name,
            "path": str(destination),
            "size_bytes": destination.stat().st_size,
            "validated": True,
            "label": f"{category.upper()} {format_name.upper()}",
        })
    return outputs
