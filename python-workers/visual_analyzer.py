"""Análisis visual local y reproducible para el MVP de Pulsaria.

El módulo evita afirmar reconocimiento de objetos cuando no existe un modelo de
visión instalado. Extrae keyframes con FFmpeg, calcula estadísticas de imagen
con Pillow y ejecuta OCR solo si Tesseract está disponible. Los artefactos
seleccionados se copian antes de cerrar el temporal a una ubicación durable.

La ruta durable puede indicarse mediante el argumento ``artifacts_dir`` o la
variable ``PULSAR_ARTIFACTS_DIR``. Si no existe, se deriva de
``PULSAR_DATA_DIR`` y, para desarrollo, de ``PULSAR_DOWNLOAD_DIR/.pulsaria``.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any


_WORKERS_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _WORKERS_DIR.parent
_MAX_AUTOMATIC_KEYFRAMES = 5


def _binary_roots() -> list[Path]:
    """Return the one approved runtime binary directory."""
    configured = os.environ.get("PULSAR_RUNTIME_ROOT", "").strip()
    if configured:
        return [Path(configured).expanduser() / "bin"]
    if (_PROJECT_ROOT / "python").is_dir():
        return [_PROJECT_ROOT / "bin"]
    return [_PROJECT_ROOT / "src-tauri" / "resources" / "bin"]


def _resolve_binary_path(
    binary_name: str,
    environment_name: str,
    label: str,
    sibling_of: str | None = None,
) -> str:
    """Resolve a real binary and fail with an actionable message if absent."""
    checked: list[str] = []
    candidates: list[Path] = []

    configured = os.environ.get(environment_name, "").strip()
    if configured:
        configured_path = Path(configured).expanduser()
        checked.append(f"{environment_name}={configured_path}")
        candidates.append(configured_path)

    if sibling_of:
        sibling = Path(sibling_of).expanduser()
        for candidate in (
            sibling.with_name(f"{binary_name}.exe"),
            sibling.with_name(binary_name),
        ):
            checked.append(str(candidate))
            candidates.append(candidate)

    for root in _binary_roots():
        for name in (f"{binary_name}.exe", binary_name):
            candidate = root / name
            checked.append(str(candidate))
            candidates.append(candidate)

    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)

    executable = f"{binary_name}.exe" if os.name == "nt" else binary_name
    raise RuntimeError(
        f"{label} no está disponible ({executable}). "
        f"Configura {environment_name} con la ruta al binario o coloca "
        f"{executable} junto al runtime incluido. "
        f"Rutas revisadas: {', '.join(checked)}"
    )


def _resolve_ffmpeg_path() -> str:
    """Resolve FFmpeg without returning a possibly missing PATH fallback."""
    return _resolve_binary_path("ffmpeg", "FFMPEG_PATH", "FFmpeg")


def resolve_ffprobe_path(ffmpeg_path: str | None = None) -> str:
    """Resolve the companion ffprobe executable required for probing media."""
    return _resolve_binary_path(
        "ffprobe",
        "FFPROBE_PATH",
        "ffprobe",
        sibling_of=ffmpeg_path,
    )


def _resolve_tesseract_path() -> str | None:
    configured = os.environ.get("TESSERACT_PATH")
    if configured and Path(configured).expanduser().is_file():
        return str(Path(configured).expanduser())
    for name in ("tesseract.exe", "tesseract"):
        candidate = _binary_roots()[0] / name
        if candidate.is_file():
            return str(candidate)
    return None


def _sample_times(
    duration_seconds: float | int | None,
    frame_count: int | None = None,
) -> list[float]:
    if frame_count is None:
        try:
            quality = int(os.environ.get("PULSAR_PROCESSING_QUALITY", "78"))
        except (TypeError, ValueError):
            quality = 78
        frame_count = 5 if quality < 35 else 12 if quality < 72 else 24

    frame_count = max(1, int(frame_count))
    duration = max(0.0, float(duration_seconds or 0.0))
    if duration <= 0 or frame_count <= 1:
        return [0.0]

    # Leave a small margin so the last seek remains valid for short videos.
    last = max(0.0, duration - 0.25)
    return [round(last * index / (frame_count - 1), 3) for index in range(frame_count)]


def _probe_duration(ffprobe_path: str, video_path: Path) -> float:
    command = [
        ffprobe_path,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    try:
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or str(error)).strip()
        raise RuntimeError(
            f"ffprobe no pudo leer la duración de {video_path.name}: {detail[:400]}"
        ) from error
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(
            "ffprobe excedió el tiempo límite al inspeccionar el video. "
            "Verifica que el archivo no esté incompleto."
        ) from error
    except OSError as error:
        raise RuntimeError(
            "ffprobe dejó de estar disponible durante el análisis. "
            "Verifica FFPROBE_PATH y los binarios multimedia incluidos. "
            f"Detalle: {error}"
        ) from error

    try:
        duration = float(result.stdout.strip())
    except (TypeError, ValueError) as error:
        raise RuntimeError(
            "ffprobe devolvió una duración inválida; el archivo puede estar dañado."
        ) from error
    if duration < 0:
        raise RuntimeError("ffprobe devolvió una duración negativa para el video.")
    return duration


def _extract_frame(
    ffmpeg_path: str,
    video_path: Path,
    timestamp: float,
    output_path: Path,
) -> None:
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
    try:
        subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=45,
        )
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or str(error)).strip()
        raise RuntimeError(
            f"FFmpeg no pudo extraer el frame en {timestamp:.3f}s: {detail[:400]}"
        ) from error
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(
            f"FFmpeg excedió el tiempo límite extrayendo el frame en {timestamp:.3f}s"
        ) from error
    except OSError as error:
        raise RuntimeError(
            "FFmpeg dejó de estar disponible durante el análisis visual. "
            "Verifica FFMPEG_PATH y los binarios multimedia incluidos. "
            f"Detalle: {error}"
        ) from error


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
    brightness_values = [
        frame.get("brightness")
        for frame in frames
        if isinstance(frame.get("brightness"), (int, float))
    ]
    visual_signal = ""
    if brightness_values:
        average_brightness = sum(brightness_values) / len(brightness_values)
        visual_signal = f"La luminosidad media medida de los keyframes es {average_brightness:.1f}/255."
    ocr_signal = (
        "Se detectó texto en pantalla: " + " | ".join(visible_text[:3]) + "."
        if visible_text
        else "No se detectó texto OCR con el motor local disponible."
    )
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


def _default_artifacts_root() -> Path:
    configured = os.environ.get("PULSAR_ARTIFACTS_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()

    data_dir = os.environ.get("PULSAR_DATA_DIR", "").strip()
    if data_dir:
        return Path(data_dir).expanduser() / "artifacts"

    download_dir = os.environ.get("PULSAR_DOWNLOAD_DIR", "").strip()
    if download_dir:
        return Path(download_dir).expanduser() / ".pulsaria" / "artifacts"

    return _PROJECT_ROOT / "data" / "artifacts"


def _job_artifacts_directory(
    video_path: Path,
    artifacts_dir: str | Path | None,
    job_id: str | int | None,
) -> Path:
    root = Path(artifacts_dir).expanduser() if artifacts_dir is not None else _default_artifacts_root()
    identifier = str(job_id) if job_id is not None else video_path.parent.name
    # Job identifiers are normally numeric. Keep a safe deterministic fallback
    # for direct CLI callers without allowing path traversal in artifact paths.
    safe_identifier = "".join(character for character in identifier if character.isalnum() or character in "-_")
    return root / (safe_identifier or "unknown-job")


def _write_artifact(source: Path, destination: Path) -> None:
    """Copy an extracted frame atomically so readers never see a partial JPEG."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.part")
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, destination)
    except OSError as error:
        raise RuntimeError(
            f"No se pudo conservar el artifact visual en {destination}: {error}"
        ) from error
    finally:
        try:
            if temporary.exists():
                temporary.unlink()
        except OSError:
            pass


def _select_keyframes(
    successful_frames: list[dict[str, Any]],
    max_count: int = _MAX_AUTOMATIC_KEYFRAMES,
) -> list[dict[str, Any]]:
    """Select first/last, strongest changes, then uniform positions.

    Every tie is resolved by timestamp and original sample index. The returned
    list is chronological for stable UI ordering, while the selection itself
    remains deterministic across repeated runs.
    """
    if not successful_frames:
        return []

    limit = max(1, min(int(max_count), _MAX_AUTOMATIC_KEYFRAMES))
    selected_indexes: set[int] = set()

    def add(index: int) -> None:
        if len(selected_indexes) < limit:
            selected_indexes.add(index)

    add(0)
    add(len(successful_frames) - 1)

    change_order = sorted(
        range(len(successful_frames)),
        key=lambda index: (
            -float(successful_frames[index].get("scene_change_score", 0.0)),
            float(successful_frames[index].get("timestamp", 0.0)),
            int(successful_frames[index].get("_sample_index", index)),
        ),
    )
    for index in change_order:
        if len(selected_indexes) >= limit:
            break
        # A zero score means that no measurable change was observed. Leave
        # those slots to the uniform fallback so static videos still get
        # temporal coverage instead of five adjacent arbitrary samples.
        if float(successful_frames[index].get("scene_change_score", 0.0)) <= 0.0:
            continue
        add(index)

    if len(selected_indexes) < limit and len(successful_frames) > 1:
        denominator = max(1, limit - 1)
        for slot in range(limit):
            target = round(slot * (len(successful_frames) - 1) / denominator)
            candidates = [
                index for index in range(len(successful_frames)) if index not in selected_indexes
            ]
            if not candidates:
                break
            nearest = min(
                candidates,
                key=lambda index: (
                    abs(index - target),
                    float(successful_frames[index].get("timestamp", 0.0)),
                    int(successful_frames[index].get("_sample_index", index)),
                ),
            )
            add(nearest)

    return [
        successful_frames[index]
        for index in sorted(
            selected_indexes,
            key=lambda selected: (
                float(successful_frames[selected].get("timestamp", 0.0)),
                int(successful_frames[selected].get("_sample_index", selected)),
            ),
        )
    ]


def _persist_automatic_artifacts(
    video_path: Path,
    successful_frames: list[dict[str, Any]],
    artifacts_dir: str | Path | None,
    job_id: str | int | None,
) -> tuple[Path | None, list[Path], list[dict[str, Any]]]:
    if not successful_frames:
        return None, [], []

    destination_dir = _job_artifacts_directory(video_path, artifacts_dir, job_id)
    selected = _select_keyframes(successful_frames)
    poster_frame = successful_frames[0]
    written_paths: set[Path] = set()
    artifact_records: list[dict[str, Any]] = []

    try:
        destination_dir.mkdir(parents=True, exist_ok=True)
        poster_path = destination_dir / "poster.jpg"
        _write_artifact(Path(poster_frame["_temporary_path"]), poster_path)
        written_paths.add(poster_path)
        poster_frame["artifact_path"] = str(poster_path)
        artifact_records.append(
            {
                "kind": "poster",
                "path": str(poster_path),
                "timestamp": float(poster_frame["timestamp"]),
                "label": "Poster automático",
                "protected": False,
                "size_bytes": poster_path.stat().st_size,
            }
        )

        keyframe_paths: list[Path] = []
        for order, frame in enumerate(selected, start=1):
            keyframe_path = destination_dir / f"keyframe-{order:02d}.jpg"
            _write_artifact(Path(frame["_temporary_path"]), keyframe_path)
            written_paths.add(keyframe_path)
            keyframe_paths.append(keyframe_path)
            frame["artifact_path"] = str(keyframe_path)
            artifact_records.append(
                {
                    "kind": "keyframe",
                    "path": str(keyframe_path),
                    "timestamp": float(frame["timestamp"]),
                    "label": f"Keyframe automático {order}",
                    "protected": False,
                    "size_bytes": keyframe_path.stat().st_size,
                }
            )

        # Only remove generated automatic outputs left by a previous retry;
        # manual screenshot names are never touched here.
        for stale in [destination_dir / "poster.jpg", *destination_dir.glob("keyframe-*.jpg")]:
            if stale not in written_paths and stale.is_file():
                stale.unlink()
    except OSError as error:
        raise RuntimeError(
            f"No se pudieron preparar los artifacts visuales en {destination_dir}: {error}"
        ) from error

    return poster_path, keyframe_paths, artifact_records


def analyze_video(
    video_path: str,
    duration_seconds: float | int | None,
    transcript: str = "",
    artifacts_dir: str | Path | None = None,
    job_id: str | int | None = None,
) -> dict[str, Any]:
    """Analyze a local video and preserve deterministic visual artifacts.

    ``artifacts_dir`` is optional to preserve the existing call contract. The
    directory is resolved from the current runtime environment when omitted;
    each job receives its own subdirectory. A poster and at most five
    chronological automatic keyframes are retained. Temporary extraction files
    are deleted only after those copies complete.
    """
    path = Path(video_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Video para análisis visual no encontrado: {video_path}")

    ffmpeg_path = _resolve_ffmpeg_path()
    duration = (
        _probe_duration(resolve_ffprobe_path(ffmpeg_path), path)
        if duration_seconds is None
        else duration_seconds
    )
    sample_times = _sample_times(duration)
    tesseract_path = _resolve_tesseract_path()
    frames: list[dict[str, Any]] = []

    with tempfile.TemporaryDirectory(prefix="pulsar-visual-") as temporary_dir:
        directory = Path(temporary_dir)
        for sample_index, timestamp in enumerate(sample_times):
            frame_path = directory / f"frame-{sample_index}.jpg"
            try:
                _extract_frame(ffmpeg_path, path, timestamp, frame_path)
                stats = _image_statistics(frame_path)
            except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired, RuntimeError) as error:
                frames.append(
                    {
                        "timestamp": timestamp,
                        "status": "error",
                        "error": str(error)[:400],
                        "_sample_index": sample_index,
                    }
                )
                continue
            frames.append(
                {
                    "timestamp": timestamp,
                    "status": "ok",
                    **stats,
                    "ocr_text": _ocr_text(tesseract_path, frame_path),
                    "_temporary_path": str(frame_path),
                    "_sample_index": sample_index,
                }
            )

        successful_frames = [frame for frame in frames if frame.get("status") == "ok"]
        previous_mean: list[float] | None = None
        for frame in successful_frames:
            current_mean = frame.get("mean_rgb")
            if isinstance(current_mean, list) and len(current_mean) == 3 and previous_mean is not None:
                frame["scene_change_score"] = round(
                    sum(abs(float(current_mean[index]) - previous_mean[index]) for index in range(3))
                    / (3 * 255),
                    4,
                )
            else:
                frame["scene_change_score"] = 0.0
            if isinstance(current_mean, list) and len(current_mean) == 3:
                previous_mean = [float(value) for value in current_mean]

        poster_path, keyframe_paths, artifact_records = _persist_automatic_artifacts(
            path,
            successful_frames,
            artifacts_dir,
            job_id,
        )

    # Internal temp bookkeeping must never leak into the JSON sent to Rust.
    for frame in frames:
        frame.pop("_temporary_path", None)
        frame.pop("_sample_index", None)

    result: dict[str, Any] = {
        "schema_version": 2,
        "analysis_mode": "dense-keyframes+scene-change+ocr-optional+durable-artifacts",
        "frame_count": len(frames),
        "successful_frame_count": len(successful_frames),
        "frames": frames,
        "poster_path": str(poster_path) if poster_path else None,
        "keyframe_paths": [str(path) for path in keyframe_paths],
        "artifacts": artifact_records,
        "artifacts_dir": str(poster_path.parent) if poster_path else None,
        "ocr_available": bool(tesseract_path),
    }
    result["instructional_guide"] = _build_instructional_guide(transcript, frames)
    result["json"] = json.dumps(result, ensure_ascii=False)
    return result
