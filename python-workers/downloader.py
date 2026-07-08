import os
import subprocess
from pathlib import Path

# ========================================================================
# DOWNLOADER: Descarga video + metadata vía yt-dlp
# Responsabilidad única: Obtener MP4 limpiamente
# ========================================================================

def download_video(url: str, job_id: int, base_dir: Path) -> str:
    """Extrae metadatos y descarga el mejor MP4. Retorna la ruta."""
    
    output_path = base_dir / str(job_id) / "video.mp4"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # yt-dlp.exe is located inside the bin/ directory
    yt_dlp_exe = base_dir.parent / "bin" / "yt-dlp.exe"
    if not yt_dlp_exe.exists():
        yt_dlp_exe = "yt-dlp" # fallback to path

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
