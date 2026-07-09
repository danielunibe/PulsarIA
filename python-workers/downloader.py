import os
import shutil
import subprocess
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


def download_video(url: str, job_id: int, base_dir: Path) -> str:
    """Extrae metadatos y descarga el mejor MP4. Retorna la ruta."""
    
    output_path = base_dir / str(job_id) / "video.mp4"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    yt_dlp_exe = resolve_yt_dlp_path()

    cmd = [
        str(yt_dlp_exe),
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
