import json
import json
import os
import sys
import shutil

import subprocess
import importlib.util
from pathlib import Path

# ========================================================================
# DOWNLOADER: Descarga video + metadata vía yt-dlp
# Responsabilidad única: Obtener MP4 limpiamente
# ========================================================================

# Directorio de este archivo: python-workers/
_WORKERS_DIR = Path(__file__).resolve().parent
# Raíz del proyecto: un nivel arriba de python-workers/
_PROJECT_ROOT = _WORKERS_DIR.parent


def resolve_yt_dlp_path() -> str:
    """
    Resuelve la ruta del ejecutable yt-dlp probando, en orden:
    1. Variable de entorno YT_DLP_PATH (override explícito).
    2. venv del worker (Windows): python-workers/.venv/Scripts/yt-dlp.exe
    3. venv del worker (Unix/macOS): python-workers/.venv/bin/yt-dlp
    4. Carpeta local de binarios del worker: python-workers/bin/yt-dlp(.exe)
    5. Carpeta bin/ en la raíz del proyecto: bin/yt-dlp(.exe)
    6. PATH del sistema (shutil.which).

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

    candidates = [
        _WORKERS_DIR / ".venv" / "Scripts" / "yt-dlp.exe",
        _WORKERS_DIR / ".venv" / "bin" / "yt-dlp",
        _WORKERS_DIR / "bin" / "yt-dlp.exe",
        _WORKERS_DIR / "bin" / "yt-dlp",
        _PROJECT_ROOT / "bin" / "yt-dlp.exe",
        _PROJECT_ROOT / "bin" / "yt-dlp",
    ]

    for candidate in candidates:
        checked.append(str(candidate))
        if candidate.exists():
            return str(candidate)

    which_result = shutil.which("yt-dlp")
    checked.append("PATH (shutil.which)")
    if which_result:
        return which_result

    raise RuntimeError(
        "yt-dlp executable not found. Checked: " + ", ".join(checked)
    )


def build_yt_dlp_base_cmd() -> list:
    """
    Construye el prefijo de comando para invocar yt-dlp de la forma más robusta.

    Preferencia:
    1. Invocación como módulo con el intérprete actual: `python -m yt_dlp`.
       Es la forma más fiable en Windows cuando la ruta del proyecto contiene
       espacios, porque evita el launcher .exe generado por pip (que puede
       fallar silenciosamente al resolver el shebang embebido).
    2. Fallback: ejecutable yt-dlp resuelto por ruta (resolve_yt_dlp_path()).

    Devuelve una lista de tokens lista para anteponer a los argumentos.
    """
    # 1. Si el módulo yt_dlp es importable con el intérprete actual, usarlo.
    if importlib.util.find_spec("yt_dlp") is not None:
        command = [sys.executable, "-m", "yt_dlp"]
    else:
        # 2. Fallback al ejecutable resuelto por ruta.
        command = [resolve_yt_dlp_path()]

    # La sesión autenticada es opt-in y nunca se persiste en SQLite ni en la UI.
    # Ejemplo en Windows: PULSAR_COOKIES_FROM_BROWSER=chrome
    browser = os.environ.get("PULSAR_COOKIES_FROM_BROWSER", "").strip().lower()
    if browser in {"chrome", "edge", "firefox"}:
        command.extend(["--cookies-from-browser", browser])
    return command


def download_video(url: str, job_id: int, base_dir: Path) -> str:
    """Extrae metadatos y descarga el mejor MP4. Retorna la ruta."""
    
    output_path = base_dir / str(job_id) / "video.mp4"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = build_yt_dlp_base_cmd() + [
        "--quiet",
        "--no-warnings",
        "-S", "ext:mp4:m4a",
        "-o", str(output_path),
        url
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        if not output_path.exists():
            raise FileNotFoundError(f"yt-dlp completó sin error, pero {output_path} no existe")
            
        return str(output_path)
        
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() if e.stderr else str(e)
        raise RuntimeError(f"Fallo descargando video: {error_msg}")

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
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=30)
        info = json.loads(result.stdout)

        return {
            "title": info.get("title", ""),
            "author": info.get("uploader") or info.get("channel") or info.get("creator", ""),
            "thumbnail": info.get("thumbnail", ""),
            "duration": info.get("duration", 0),
            "upload_date": info.get("upload_date", ""),
            "description": info.get("description", "")[:500],
            "hashtags": info.get("tags", [])[:10],
            "platform": info.get("extractor_key", "unknown").lower(),
            "view_count": info.get("view_count", 0),
            "like_count": info.get("like_count", 0),
        }
    except subprocess.CalledProcessError as error:
        detail = error.stderr.strip() if error.stderr else str(error)
        raise RuntimeError(f"Fallo extrayendo metadata: {detail}") from error
    except (json.JSONDecodeError, subprocess.TimeoutExpired) as error:
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
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=60)
        videos = []

        for line in result.stdout.strip().split('\n'):
            if line.strip():
                info = json.loads(line)
                candidate = info.get('webpage_url') or info.get('original_url') or info.get('url')
                if isinstance(candidate, str) and candidate.startswith(('http://', 'https://')):
                    videos.append(candidate)

        return videos
    except Exception as e:
        print(f"Error extracting playlist: {e}", flush=True)
        return []
