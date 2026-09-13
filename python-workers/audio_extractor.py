"""
Pulsaria — Audio Extractor (audio_extractor.py)
=====================================================

Responsabilidad: Extraer la pista de audio de un video usando FFmpeg.

Formato de salida:
    - MP3 16kHz mono VBR Q2 (formato óptimo para Whisper)
    - Guardado junto al video en el directorio de procesamiento

Resolución multimedia:
    Se prueban las variables de entorno explícitas y los binarios incluidos
    bajo ``PULSAR_RUNTIME_ROOT``. Nunca se acepta una herramienta encontrada
    por PATH ni se devuelve un nombre de ejecutable ambiguo.
"""
import os
import subprocess
from pathlib import Path

# ========================================================================
# AUDIO EXTRACTOR: Extracción FFMPEG
# Responsabilidad: Convertir MP4 -> MP3 optimizado para Whisper (16kHz Mono)
# ========================================================================

_WORKERS_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _WORKERS_DIR.parent


def _audio_timeout_seconds() -> float:
    """Return a bounded FFmpeg timeout configurable for slower machines."""
    try:
        configured = float(os.environ.get("PULSAR_AUDIO_TIMEOUT_SECONDS", "180"))
    except (TypeError, ValueError):
        configured = 180.0
    return max(30.0, min(configured, 1800.0))


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
    """Resolve a bundled/system binary or raise an actionable error."""
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


def resolve_ffmpeg_path() -> str:
    """
    Resuelve la ruta al ejecutable de FFmpeg.

    Orden de búsqueda:
        1. Variable de entorno FFMPEG_PATH (override explícito)
        2. bin/ffmpeg bajo la raíz de runtime aprobada

    Raises:
        RuntimeError: Si no se encuentra un ejecutable real de FFmpeg.
    """
    return _resolve_binary_path("ffmpeg", "FFMPEG_PATH", "FFmpeg")


def resolve_ffprobe_path(ffmpeg_path: str | None = None) -> str:
    """Resolve the companion ffprobe executable required by the pipeline.

    ``ffprobe`` is intentionally resolved independently from FFmpeg. This
    prevents a portable bundle that contains only one of the two tools from
    appearing healthy and later taking an incorrect silent fallback.
    """
    return _resolve_binary_path(
        "ffprobe",
        "FFPROBE_PATH",
        "ffprobe",
        sibling_of=ffmpeg_path,
    )


def extract_audio(video_path: str) -> str:
    """Extrae audio a 16kHz mono (ideal para Whisper) y lo guarda junto al video."""
    vid_path = Path(video_path).resolve()
    if not vid_path.exists():
        raise FileNotFoundError(f"Video input no encontrado: {video_path}")

    audio_path = vid_path.parent / "audio.mp3"
    ffmpeg_exe = resolve_ffmpeg_path()

    cmd = [
        str(ffmpeg_exe),
        "-i", str(vid_path),
        "-vn",           # No video
        "-acodec", "libmp3lame",
        "-ar", "16000",  # 16kHz compatible con whisper
        "-ac", "1",      # Mono channel
        "-q:a", "2",     # Calidad VBR 2
        "-y",            # Sobrescribir sin preguntar
        str(audio_path)
    ]

    try:
        subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=_audio_timeout_seconds(),
        )
        if not audio_path.exists():
            raise FileNotFoundError(f"FFMPEG no generó la salida esperada: {audio_path}")
            
        return str(audio_path)
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() if e.stderr else str(e)
        raise RuntimeError(f"Fallo FFmpeg (Extraction Error): {error_msg}")
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(
            f"FFmpeg excedió el tiempo límite de {_audio_timeout_seconds():g}s"
        ) from error
    except OSError as error:
        raise RuntimeError(
            "FFmpeg dejó de estar disponible durante la extracción. "
            "Verifica FFMPEG_PATH o reinstala los binarios multimedia incluidos. "
            f"Detalle: {error}"
        ) from error
