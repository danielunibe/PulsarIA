import os
import sys
import shutil
import subprocess
import importlib.util
import json
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
        return [sys.executable, "-m", "yt_dlp"]

    # 2. Fallback al ejecutable resuelto por ruta.
    return [resolve_yt_dlp_path()]


def extract_metadata(url: str) -> dict:
    """Extrae metadata del video sin descargarlo usando yt-dlp Python API."""
    try:
        import yt_dlp
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                'title': info.get('title', '') or '',
                'uploader': info.get('uploader', '') or '',
                'thumbnail': info.get('thumbnail', '') or '',
                'duration': int(info.get('duration') or 0),
                'upload_date': info.get('upload_date', '') or '',
            }
    except Exception as e:
        return {
            'title': '',
            'uploader': '',
            'thumbnail': '',
            'duration': 0,
            'upload_date': '',
        }


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
