"""
Pulsaria — Video Downloader (downloader.py)
==================================================

Responsabilidad: Descargar videos y extraer metadata usando yt-dlp.

Este módulo resuelve yt-dlp desde el runtime aprobado y ejecuta las
siguientes operaciones:

- **extract_metadata()**: Extrae metadata sin descargar (--dump-json)
- **download_video()**: Descarga el mejor MP4 disponible
- **extract_playlist_videos()**: Expande URLs de playlists/colecciones

Resolución de rutas:
    Todas las rutas se calculan de forma relativa a este archivo,
    nunca hardcodeadas con rutas absolutas de una máquina específica.
"""
import json
import os
import sys

import subprocess
import importlib.util
from pathlib import Path


DEFAULT_DOWNLOAD_TIMEOUT_SECONDS = 2 * 60 * 60

# ========================================================================
# DOWNLOADER: Descarga video + metadata vía yt-dlp
# Responsabilidad única: Obtener MP4 limpiamente
# ========================================================================

# Directorio de este archivo: python-workers/
_WORKERS_DIR = Path(__file__).resolve().parent
# Raíz del proyecto: un nivel arriba de python-workers/
_PROJECT_ROOT = _WORKERS_DIR.parent


def _runtime_root() -> Path:
    configured = os.environ.get("PULSAR_RUNTIME_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser()
    if (_PROJECT_ROOT / "python").is_dir():
        return _PROJECT_ROOT
    return _PROJECT_ROOT / "src-tauri" / "resources"


def _resolve_ffmpeg_path() -> str | None:
    """Resolve the FFmpeg binary for yt-dlp post-processing.

    The development tree and installed bundle expose the binary below the
    same ``PULSAR_RUNTIME_ROOT/bin`` contract.
    """
    configured = os.environ.get("FFMPEG_PATH")
    if configured and Path(configured).is_file():
        return configured

    candidates = [_runtime_root() / "bin" / "ffmpeg.exe", _runtime_root() / "bin" / "ffmpeg"]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


def _download_timeout_seconds() -> float:
    configured = os.environ.get("PULSAR_DOWNLOAD_TIMEOUT_SECONDS", "")
    try:
        timeout = float(configured)
    except (TypeError, ValueError):
        timeout = DEFAULT_DOWNLOAD_TIMEOUT_SECONDS
    return timeout if timeout > 0 else DEFAULT_DOWNLOAD_TIMEOUT_SECONDS


def _process_error_detail(error: subprocess.CalledProcessError) -> str:
    stderr = (error.stderr or "").strip() if isinstance(error.stderr, str) else ""
    stdout = (error.stdout or "").strip() if isinstance(error.stdout, str) else ""
    return stderr or stdout or str(error)


def resolve_yt_dlp_path() -> str:
    """
    Resuelve la ruta del ejecutable yt-dlp probando múltiples ubicaciones.

    Orden de búsqueda:
    1. Variable de entorno YT_DLP_PATH (override explícito).
    2. bin/yt-dlp bajo la raíz de runtime aprobada.

    Todas las rutas se calculan de forma relativa a este archivo (__file__),
    nunca hardcodeadas con rutas absolutas de una máquina específica.

    Lanza RuntimeError con un mensaje claro si no se encuentra ningún candidato.
    """
    checked = []

    env_path = os.environ.get("YT_DLP_PATH")
    if env_path:
        checked.append(f"YT_DLP_PATH={env_path}")
        if Path(env_path).exists():
            return env_path

    candidates = [_runtime_root() / "bin" / "yt-dlp.exe", _runtime_root() / "bin" / "yt-dlp"]

    for candidate in candidates:
        checked.append(str(candidate))
        if candidate.exists():
            return str(candidate)

    raise RuntimeError(
        "yt-dlp executable not found. Checked: " + ", ".join(checked)
    )


def build_yt_dlp_base_cmd() -> list:
    """
    Construye el prefijo de comando para invocar yt-dlp de la forma más robusta.

    Invoca siempre el módulo con el intérprete que ejecuta el worker. Así el
    runtime aprobado controla también la versión de yt-dlp y no se recurre a
    un ejecutable externo ni a PATH.

    Devuelve una lista de tokens lista para anteponer a los argumentos.
    """
    command = [sys.executable, "-m", "yt_dlp"]

    # La sesión autenticada es opt-in y nunca se persiste en SQLite ni en la UI.
    # Ejemplo en Windows: PULSAR_COOKIES_FROM_BROWSER=chrome
    browser = os.environ.get("PULSAR_COOKIES_FROM_BROWSER", "").strip().lower()
    if browser in {"chrome", "edge", "firefox"}:
        command.extend(["--cookies-from-browser", browser])

    # TikTok WAF / TLS challenge bypass via curl_cffi impersonation
    if importlib.util.find_spec("curl_cffi") is not None:
        command.extend(["--impersonate", "chrome"])

    ffmpeg_path = _resolve_ffmpeg_path()
    if ffmpeg_path:
        command.extend(["--ffmpeg-location", ffmpeg_path])

    return command


def _get_format_args() -> list:
    """
    Bug #34 FIX: Read format preference from PULSAR_FORMATS env var.
    Bug #78 FIX: TikTok's HEVC (bytevc1) formats report acodec=aac in metadata
    but the downloaded container is video-only. We MUST use -f (format filter)
    to force h264 selection, not just -S (sort).
    
    Returns a list of yt-dlp CLI args for format selection.
    """
    formats_json = os.environ.get("PULSAR_FORMATS", "")
    try:
        formats = json.loads(formats_json) if formats_json else []
        if not isinstance(formats, list):
            formats = []
    except (json.JSONDecodeError, TypeError):
        formats = []

    # -S provides sort fallback when -f doesn't narrow enough
    # For mp4/mkv/etc, sort by extension preference
    video_fmts = [f for f in formats if f in ("mp4", "mkv", "webm", "mov")]
    if video_fmts:
        sort_str = "ext:" + ":".join(video_fmts) + ":vcodec:h264:m4a"
    else:
        sort_str = "ext:mp4:vcodec:h264:m4a"

    # -f forces h264 video codec — critical for TikTok HEVC avoidance.
    # Pattern: best muxed file with h264 video; fallback to best with audio.
    return ["-f", "b[vcodec~='h264']/b[acodec!=none]/b", "-S", sort_str]


def _has_audio_stream(video_path: str) -> bool:
    """Bug #78 FIX: Check if a video file contains an audio stream.
    Uses ffprobe to detect audio tracks. Returns False if ffprobe is
    unavailable or the file has no audio — signals a retry with h264.
    """
    ffmpeg_path = _resolve_ffmpeg_path()
    ffprobe_path = None
    runtime_ffprobe = _runtime_root() / "bin" / ("ffprobe.exe" if os.name == "nt" else "ffprobe")
    if runtime_ffprobe.is_file():
        ffprobe_path = str(runtime_ffprobe)
    if ffmpeg_path:
        sibling = Path(ffmpeg_path).with_name(
            "ffprobe.exe" if Path(ffmpeg_path).suffix.lower() == ".exe" else "ffprobe"
        )
        if sibling.is_file():
            ffprobe_path = str(sibling)
    if not ffprobe_path:
        # Some portable bundles ship only ffmpeg. Use a short stream-map
        # probe instead of assuming that every container has audio; the old
        # optimistic fallback could send silent videos into Whisper.
        ffmpeg_exe = ffmpeg_path
        if not ffmpeg_exe:
            return False
        try:
            result = subprocess.run(
                [ffmpeg_exe, "-v", "error", "-i", video_path,
                 "-map", "0:a:0", "-t", "0.1", "-f", "null", "-"],
                capture_output=True,
                text=True,
                timeout=30,
            )
            return result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError, OSError):
            return False

    try:
        result = subprocess.run(
            [ffprobe_path, "-v", "error", "-select_streams", "a",
             "-show_entries", "stream=codec_type", "-of", "csv=p=0", video_path],
            capture_output=True, text=True, timeout=30
        )
        return bool(result.stdout.strip())
    except (subprocess.SubprocessError, FileNotFoundError, OSError):
        return False


def download_video(url: str, job_id: int, base_dir: Path) -> str:
    """Extrae metadatos y descarga el mejor video. Retorna la ruta."""
    
    output_dir = base_dir / str(job_id)
    output_path = output_dir / "video.mp4"
    output_dir.mkdir(parents=True, exist_ok=True)

    format_args = _get_format_args()
    cmd = build_yt_dlp_base_cmd() + [
        "--quiet",
        "--no-warnings",
    ] + format_args + [
        "-o", str(output_path),
        url
    ]

    try:
        subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=_download_timeout_seconds(),
        )
        # Bug #26 FIX: Find actual downloaded file — yt-dlp may rename on conflict
        if not output_path.exists():
            mp4_files = sorted(output_dir.glob('*.mp4'), key=lambda p: p.stat().st_mtime, reverse=True)
            if mp4_files:
                actual = mp4_files[0]
                if actual != output_path:
                    actual.rename(output_path)
            else:
                raise FileNotFoundError(f"yt-dlp completó sin error, pero no se encontró MP4 en {output_dir}")

        # Bug #78 FIX: Verify the downloaded video has an audio stream.
        # TikTok HEVC (bytevc1) formats falsely report acodec=aac in metadata
        # but the actual container often contains only the video stream.
        if not _has_audio_stream(str(output_path)):
            # Re-download forcing H.264 format which has proper audio muxing
            retry_cmd = build_yt_dlp_base_cmd() + [
                "--quiet",
                "--no-warnings",
                "-f", "bv[vcodec~='h264']+ba/b[vcodec~='h264']",
                "-o", str(output_path),
                url
            ]
            try:
                subprocess.run(
                    retry_cmd,
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=_download_timeout_seconds(),
                )
                if not output_path.exists():
                    mp4_files = sorted(output_dir.glob('*.mp4'), key=lambda p: p.stat().st_mtime, reverse=True)
                    if mp4_files:
                        mp4_files[0].rename(output_path)
                if not output_path.exists():
                    raise FileNotFoundError(
                        f"El reintento H.264 no generó un MP4 en {output_dir}"
                    )
                if not _has_audio_stream(str(output_path)):
                    raise RuntimeError(
                        "El video descargado no contiene una pista de audio compatible"
                    )
            except subprocess.CalledProcessError as error:
                raise RuntimeError(
                    f"Fallo descargando video H.264 con audio: {_process_error_detail(error)}"
                ) from error

        return str(output_path)

    except subprocess.CalledProcessError as e:
        error_msg = _process_error_detail(e)
        raise RuntimeError(f"Fallo descargando video: {error_msg}")
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(
            f"Tiempo agotado descargando video después de {_download_timeout_seconds():g}s"
        ) from error

def extract_metadata(url: str) -> dict:
    """Extrae metadatos del video sin descargarlo (solo JSON dump)."""
    cmd = build_yt_dlp_base_cmd() + [
        "--quiet",
        "--no-warnings", 
        "--dump-json",
        "--no-download",
        url
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True, timeout=60
        )
        info = json.loads(result.stdout)
        if not isinstance(info, dict):
            raise ValueError("yt-dlp no devolvió un objeto JSON de metadata")

        title = info.get("title") or ""
        author = info.get("uploader") or info.get("channel") or info.get("creator") or ""
        description = info.get("description") or ""
        tags = info.get("tags") or []
        if not isinstance(tags, list):
            tags = []

        return {
            "title": str(title),
            "author": str(author),
            "thumbnail": str(info.get("thumbnail") or ""),
            "duration": info.get("duration", 0),
            "upload_date": str(info.get("upload_date") or ""),
            "description": str(description)[:500],
            "hashtags": [str(tag) for tag in tags[:10]],
            "platform": str(info.get("extractor_key") or "unknown").lower(),
            "view_count": info.get("view_count", 0),
            "like_count": info.get("like_count", 0),
        }
    except subprocess.CalledProcessError as error:
        detail = _process_error_detail(error)
        raise RuntimeError(f"Fallo extrayendo metadata: {detail}") from error
    except (json.JSONDecodeError, ValueError, subprocess.TimeoutExpired, OSError) as error:
        raise RuntimeError(f"Respuesta inválida de metadata: {error}") from error


def extract_playlist_videos(url: str) -> list[str]:
    """Extrae URLs individuales de una playlist de TikTok."""
    cmd = build_yt_dlp_base_cmd() + [
        "--quiet",
        "--no-warnings",
        "--flat-playlist",
        "--playlist-end", "200",
        "--dump-json",

        "--no-download",
        url
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True, timeout=60
        )
        videos = []

        for line_number, line in enumerate(result.stdout.splitlines(), start=1):
            if line.strip():
                try:
                    info = json.loads(line)
                except json.JSONDecodeError as error:
                    raise RuntimeError(
                        f"Respuesta inválida de playlist en la línea {line_number}: {error}"
                    ) from error
                if not isinstance(info, dict):
                    continue
                candidate = info.get('webpage_url') or info.get('original_url') or info.get('url')
                if isinstance(candidate, str) and candidate.startswith(('http://', 'https://')):
                    videos.append(candidate)

        return list(dict.fromkeys(videos))
    except subprocess.CalledProcessError as error:
        raise RuntimeError(
            f"Fallo expandiendo colección: {_process_error_detail(error)}"
        ) from error
    except (subprocess.TimeoutExpired, OSError) as error:
        raise RuntimeError(f"Fallo expandiendo colección: {error}") from error
