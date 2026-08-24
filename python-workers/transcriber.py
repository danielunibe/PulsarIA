from pathlib import Path
import os
import json

# ========================================================================
# TRANSCRIBER: STT nativo (Whisper / Faster-Whisper)
# Carga diferida (lazy import) para resiliencia en tiempo de importación
# ========================================================================

_whisper_model = None

def get_model(path: Path):
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            _whisper_model = WhisperModel(
                model_size_or_path="tiny",
                device="cpu",
                compute_type="int8",
                download_root=os.path.join(path.parents[2] if len(path.parents) > 2 else path.parent, "assets", "models")
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
    except IOError:
        pass

    payload = {
        "event": "transcription_complete",
        "text": final_text,
        "segments": segments_data,
        "language": info.language if info else "unknown",
        "duration": round(info.duration, 2) if info else 0
    }
    print(json.dumps(payload), flush=True)

    return {"text": final_text, "segments": segments_data}
