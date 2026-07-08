import subprocess
from pathlib import Path

# ========================================================================
# AUDIO EXTRACTOR: Extracción FFMPEG
# Responsabilidad única: Convertir MP4 -> MP3 optimizado para Whisper
# ========================================================================

def extract_audio(video_path: str) -> str:
    """Extrae audio a 16kHz mono (ideal para Whisper) y lo guarda junto al video."""
    vid_path = Path(video_path)
    if not vid_path.exists():
        raise FileNotFoundError(f"Video input no encontrado: {video_path}")

    audio_path = vid_path.parent / "audio.mp3"
    
    # bin/ffmpeg.exe 
    ffmpeg_exe = vid_path.parents[2] / "bin" / "ffmpeg.exe"
    if not ffmpeg_exe.exists():
        ffmpeg_exe = "ffmpeg" # fallback path
        
    cmd = [
        str(ffmpeg_exe),
        "-i", str(vid_path),
        "-vn",           # No video
        "-acodec", "libmp3lame",
        "-ar", "16000",  # 16kHz compatible con whisper
        "-ac", "1",      # Mono chanel
        "-q:a", "2",     # Calidad VBR 2
        "-y",            # Sobrescribir sin preguntar
        str(audio_path)
    ]

    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        if not audio_path.exists():
            raise FileNotFoundError(f"FFMPEG no generó la salida esperada: {audio_path}")
            
        return str(audio_path)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Fallo FFmpeg (Extraction Error): {e.stderr}")
