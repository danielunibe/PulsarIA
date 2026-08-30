"""Análisis visual local y reproducible para el MVP de Pulsaria.

El módulo evita afirmar reconocimiento de objetos cuando no existe un modelo de
visión instalado. Extrae keyframes con FFmpeg, calcula estadísticas de imagen
con Pillow y ejecuta OCR solo si Tesseract está disponible. El resultado es
JSON serializable y sirve como base del instructivo audiovisual.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any


def _resolve_ffmpeg_path() -> str:
    configured = os.environ.get("FFMPEG_PATH")
    if configured and Path(configured).exists():
        return configured

    candidates = [
        Path(__file__).resolve().parent.parent / "bin" / "ffmpeg.exe",
        Path(__file__).resolve().parent.parent / "bin" / "ffmpeg",
        Path(__file__).resolve().parent / "bin" / "ffmpeg.exe",
        Path(__file__).resolve().parent / "bin" / "ffmpeg",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    return shutil.which("ffmpeg") or "ffmpeg"


def _resolve_tesseract_path() -> str | None:
    configured = os.environ.get("TESSERACT_PATH")
    if configured and Path(configured).exists():
        return configured
    return shutil.which("tesseract")


def _sample_times(duration_seconds: float | int | None, frame_count: int = 5) -> list[float]:
    duration = max(0.0, float(duration_seconds or 0.0))
    if duration <= 0:
        return [0.0]
    if frame_count <= 1:
        return [0.0]
    last = max(0.0, duration - 0.25)
    return [round(last * index / (frame_count - 1), 3) for index in range(frame_count)]


def _extract_frame(ffmpeg_path: str, video_path: Path, timestamp: float, output_path: Path) -> None:
    command = [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{timestamp:.3f}",
        "-i",
        str(video_path),
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        "-y",
        str(output_path),
    ]
    subprocess.run(command, check=True, capture_output=True, text=True, timeout=45)


def _image_statistics(image_path: Path) -> dict[str, Any]:
    try:
        from PIL import Image, ImageStat
    except ImportError as error:
        raise RuntimeError("Pillow no está instalado; no se puede analizar keyframes") from error

    with Image.open(image_path) as image:
        rgb = image.convert("RGB")
        stat = ImageStat.Stat(rgb)
        mean = [round(value, 2) for value in stat.mean]
        brightness = round(sum(mean) / 3.0, 2)
        return {
            "width": rgb.width,
            "height": rgb.height,
            "mean_rgb": mean,
            "brightness": brightness,
        }


def _ocr_text(tesseract_path: str | None, image_path: Path) -> str:
    if not tesseract_path:
        return ""
    try:
        result = subprocess.run(
            [tesseract_path, str(image_path), "stdout", "--psm", "6"],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if result.returncode != 0:
        return ""
    return " ".join(result.stdout.split())[:1200]


def _build_instructional_guide(
    transcript: str,
    frames: list[dict[str, Any]],
) -> str:
    visible_text = [frame["ocr_text"] for frame in frames if frame.get("ocr_text")]
    brightness_values = [frame.get("brightness") for frame in frames if isinstance(frame.get("brightness"), (int, float))]
    visual_signal = ""
    if brightness_values:
        average_brightness = sum(brightness_values) / len(brightness_values)
        visual_signal = f"La luminosidad media medida de los keyframes es {average_brightness:.1f}/255."
    ocr_signal = "Se detectó texto en pantalla: " + " | ".join(visible_text[:3]) + "." if visible_text else "No se detectó texto OCR con el motor local disponible."
    transcript_signal = transcript.strip()[:1600] if transcript.strip() else "No hay transcripción disponible."

    return (
        "# Instructivo audiovisual\n\n"
        "## 1. Narración y contexto\n"
        f"{transcript_signal}\n\n"
        "## 2. Evidencia visual medible\n"
        f"Se analizaron {len(frames)} keyframes distribuidos en el video. {visual_signal} {ocr_signal}\n\n"
        "## 3. Uso recomendado\n"
        "Utiliza la transcripción para localizar instrucciones habladas y los tiempos de los keyframes para revisar cambios de pantalla. Las etiquetas visuales de este MVP son evidencia de keyframe, color, tamaño y OCR; no representan reconocimiento de objetos no verificado."
    )


def analyze_video(video_path: str, duration_seconds: float | int | None, transcript: str = "") -> dict[str, Any]:
    """Analiza un video local y devuelve datos JSON serializables."""
    path = Path(video_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Video para análisis visual no encontrado: {video_path}")

    ffmpeg_path = _resolve_ffmpeg_path()
    frames: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="pulsar-visual-") as temporary_dir:
        directory = Path(temporary_dir)
        for index, timestamp in enumerate(_sample_times(duration_seconds)):
            frame_path = directory / f"frame-{index}.jpg"
            try:
                _extract_frame(ffmpeg_path, path, timestamp, frame_path)
                stats = _image_statistics(frame_path)
            except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired, RuntimeError) as error:
                frames.append({"timestamp": timestamp, "status": "error", "error": str(error)[:400]})
                continue
            frames.append(
                {
                    "timestamp": timestamp,
                    "status": "ok",
                    **stats,
                    "ocr_text": _ocr_text(_resolve_tesseract_path(), frame_path),
                }
            )

    successful_frames = [frame for frame in frames if frame.get("status") == "ok"]
    result = {
        "schema_version": 1,
        "analysis_mode": "keyframe-statistics+ocr-optional",
        "frame_count": len(frames),
        "successful_frame_count": len(successful_frames),
        "frames": frames,
    }
    result["instructional_guide"] = _build_instructional_guide(transcript, frames)
    result["json"] = json.dumps(result, ensure_ascii=False)
    return result
