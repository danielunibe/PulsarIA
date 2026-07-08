from pathlib import Path
from faster_whisper import WhisperModel
import os
import json

# ========================================================================
# TRANSCRIBER: STT nativo
# Adicional: Emite JSON localmente para nutrir `transcription_complete` 
# ========================================================================

_whisper_model = None

def get_model(path: Path) -> WhisperModel:
    global _whisper_model
    if _whisper_model is None:
        try:
            _whisper_model = WhisperModel(
                model_size_or_path="tiny",
                device="cpu",
                compute_type="int8",
                download_root=os.path.join(path.parents[2], "assets", "models")
            )
        except Exception as e:
            raise RuntimeError(f"Fallo al cargar el motor Whisper: {e}")
    return _whisper_model

def transcribe_audio(audio_path: str) -> str:
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Archivo de audio no encontrado: {audio_path}")

    model = get_model(path)

    try:
        segments, info = model.transcribe(str(path), beam_size=5)
    except Exception as e:
        raise RuntimeError(f"Fallo en inferencia Whisper: {e}")

    full_text = []
    for segment in segments:
        full_text.append(segment.text.strip())

    final_text = " ".join(full_text).strip()
    
    if not final_text:
        raise ValueError("Transcripción resultante vacía")

    # Backup local filesystem persistente 
    transcript_path = path.parent / "transcript.txt"
    try:
        with open(transcript_path, "w", encoding="utf-8") as f:
            f.write(final_text)
    except IOError:
        pass 

    # Emitir evento semántico directo para IPC hacia Rust
    payload = {
        "event": "transcription_complete",
        "text": final_text
    }
    print(json.dumps(payload), flush=True)

    return final_text
