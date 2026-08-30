import os
from pathlib import Path

# ========================================================================
# TRANSCRIBER: STT nativo (Whisper / Faster-Whisper)
# Carga diferida (lazy import) para resiliencia en tiempo de importación
# ========================================================================

_whisper_model = None


def get_model(_audio_path: Path):
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            project_root = Path(__file__).resolve().parent.parent
            model_name = os.environ.get("WHISPER_MODEL", "tiny")
            device = os.environ.get("WHISPER_DEVICE", "cpu")
            compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
            _whisper_model = WhisperModel(
                model_size_or_path=model_name,
                device=device,
                compute_type=compute_type,
                download_root=str(project_root / "assets" / "models"),
            )
        except Exception as e:
            raise RuntimeError(f"Fallo al cargar el motor Whisper: {e}")
    return _whisper_model

def transcribe_audio(audio_path: str) -> dict:
    """Transcribe audio y retorna texto completo + segmentos con timestamps."""
    path = Path(audio_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Archivo de audio no encontrado: {audio_path}")

    model = get_model(path)

    try:
        segments_gen, info = model.transcribe(
            str(path), 
            beam_size=5,
            word_timestamps=False
        )
        segments_list = list(segments_gen)
    except Exception as e:
        raise RuntimeError(f"Fallo en inferencia Whisper: {e}")

    full_text_parts = []
    segments_data = []
    for seg in segments_list:
        text = seg.text.strip()
        full_text_parts.append(text)
        segments_data.append({
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": text
        })

    final_text = " ".join(full_text_parts).strip()
    
    if not final_text:
        raise ValueError("Transcripcion resultante vacia")

    transcript_path = path.parent / "transcript.txt"
    try:
        with open(transcript_path, "w", encoding="utf-8") as f:
            f.write(final_text)
    except IOError as error:
        raise RuntimeError(f"No se pudo guardar la transcripción: {error}") from error

    return {
        "text": final_text,
        "segments": segments_data,
        "language": info.language if info else "unknown",
        "duration": round(info.duration, 2) if info else 0,
    }
