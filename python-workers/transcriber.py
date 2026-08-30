"""
Pulsar Eventide — Audio Transcriber (transcriber.py)
====================================================

Responsabilidad: Transcribir audio a texto usando Faster-Whisper.

Características:
- Carga diferida (lazy import) del modelo para resiliencia
- Modelo configurável via variables de entorno:
  - WHISPER_MODEL: tamaño del modelo (default: 'tiny')
  - WHISPER_DEVICE: dispositivo (default: 'cpu')
  - WHISPER_COMPUTE_TYPE: precisión (default: 'int8')
- Retorna tanto el texto completo como segmentos con timestamps

Uso:
    resultado = transcribe_audio('/ruta/a/audio.wav')
    print(resultado['text'])       # Texto completo
    print(resultado['segments'])   # [{'start': 0.0, 'end': 4.2, 'text': '...'}]
"""
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
    """
    Transcribe un archivo de audio y retorna texto + timestamps.

    Args:
        audio_path: Ruta al archivo de audio (WAV 16kHz mono recomendado).

    Returns:
        dict con claves:
            - 'text': str — Texto completo transcrito
            - 'segments': list[dict] — Segmentos con timestamps
                - 'start': float — Tiempo de inicio en segundos
                - 'end': float — Tiempo de fin en segundos
                - 'text': str — Texto del segmento
            - 'language': str — Idioma detectado
            - 'duration': float — Duración del audio en segundos

    Raises:
        FileNotFoundError: Si el archivo de audio no existe.
        RuntimeError: Si falla la carga del modelo Whisper.
    """
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
    
    # Bug #9 FIX: Empty transcript is valid (video without dialogue)
    # Don't crash — return empty result so pipeline continues
    if not final_text:
        return {
            "text": "",
            "segments": [],
            "language": info.language if info else "unknown",
            "duration": round(info.duration, 2) if info else 0,
        }

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
