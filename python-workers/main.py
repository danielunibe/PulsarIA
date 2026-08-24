import sys
from pathlib import Path

# Componentes del pipeline separados por responsabilidad
from models import JobInput
from events import emit_event, emit_error, MediaMetadata
from downloader import download_video, extract_metadata
from audio_extractor import extract_audio
from transcriber import transcribe_audio

# ========================================================================
# MAIN ORCHESTRATOR: IPC Worker Entrypoint
# Responsabilidad única: Orquestar el pipeline multimedia y emitir 
# el estado al orquestador en Rust consumiendo el STDIN interactivo.
# Protege excepciones para blindar el canal de comunicación asíncrono.
# ========================================================================

def run_pipeline() -> None:
    # 1. Modo Daemon: Leer payloads desde Standard Input en un loop infinito
    for raw_input in sys.stdin:
        if not raw_input.strip():
            continue

        try:
            # Decodificar Payload (Rust -> Python)
            job = JobInput.from_json(raw_input)
            
            base_dir = Path(__file__).parent.parent / "data" / "processing"

            # ------------------- 0. METADATA PHASE -------------------
            emit_event("metadata_started", job_id=job.job_id)
            meta = extract_metadata(job.url)
            metadata = MediaMetadata(
                title=meta['title'],
                uploader=meta['uploader'],
                thumbnail=meta['thumbnail'],
                duration=meta['duration'],
                upload_date=meta['upload_date'],
            )
            emit_event("metadata", job_id=job.job_id, metadata=metadata)

            # ------------------- 1. DOWNLOAD PHASE -------------------
            emit_event("download_started", job_id=job.job_id)
            video_path = download_video(url=job.url, job_id=job.job_id, base_dir=base_dir)
            emit_event("download_complete", job_id=job.job_id, message=video_path)

            # ------------------- 2. AUDIO PHASE -------------------
            emit_event("transcription_started", job_id=job.job_id)  # Reutilizamos mapeo previo para simplificar UI state
            audio_path = extract_audio(video_path=video_path)

            # ------------------- 3. TRANSCRIPTION PHASE -------------------
            transcript_text = transcribe_audio(audio_path=audio_path)

            # ------------------- 4. END PHASE -------------------
            emit_event("completed", job_id=job.job_id, text=transcript_text)

        except ValueError as e:
            # Error de validación (Ej: mala URL o JSON corrupto)
            emit_error(f"Error de validación: {str(e)}")
        except (FileNotFoundError, RuntimeError) as e:
            # Error en el pipeline multimedia
            emit_error(f"Falla de pipeline: {str(e)}")
        except Exception as e:
            # Crash catastrofico no-contemplado
            emit_error(f"Error nativo de Worker: {str(e)}")

if __name__ == "__main__":
    run_pipeline()
