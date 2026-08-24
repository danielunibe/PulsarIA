import subprocess
import shutil
import os
from pathlib import Path

# ========================================================================
# AUDIO EXTRACTOR: Extracción FFMPEG
# Responsabilidad: Convertir MP4 -> MP3/WAV optimizado para Whisper (16kHz Mono)
# ========================================================================

_WORKERS_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _WORKERS_DIR.parent


def resolve_ffmpeg_path() -> str:
    """Resuelve la ruta a ffmpeg probando variables de entorno, binarios locales y PATH."""
    env_ffmpeg = os.environ.get("FFMPEG_PATH")
    if env_ffmpeg and Path(env_ffmpeg).exists():
        return env_ffmpeg

    candidates = [
        _PROJECT_ROOT / "bin" / "ffmpeg.exe",
        _PROJECT_ROOT / "bin" / "ffmpeg",
        _WORKERS_DIR / "bin" / "ffmpeg.exe",
        _WORKERS_DIR / "bin" / "ffmpeg",
        _WORKERS_DIR / ".venv" / "Scripts" / "ffmpeg.exe",
    ]

    for cand in candidates:
        if cand.exists():
            return str(cand)

    which_path = shutil.which("ffmpeg")
    if which_path:
        return which_path

    return "ffmpeg"


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
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        if not audio_path.exists():
            raise FileNotFoundError(f"FFMPEG no generó la salida esperada: {audio_path}")
            
        return str(audio_path)
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() if e.stderr else str(e)
        raise RuntimeError(f"Fallo FFmpeg (Extraction Error): {error_msg}")
