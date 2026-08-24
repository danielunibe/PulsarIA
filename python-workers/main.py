import sys
import argparse
from pathlib import Path
import json

# Componentes del pipeline separados por responsabilidad
from models import JobInput
from events import emit_event, emit_error
from downloader import download_video, extract_metadata, extract_playlist_videos
from audio_extractor import extract_audio
from transcriber import transcribe_audio

# ========================================================================
# MAIN ORCHESTRATOR: IPC Worker Entrypoint
# Responsabilidad: Orquestar el pipeline multimedia y emitir el estado
# tanto para invocaciones CLI individuales (--job_id, --url) como para
# modo daemon persistente vía STDIN (para WorkerPool).
# ========================================================================

def process_single_job(job_id: int, url: str) -> None:
    """Ejecuta el pipeline completo para un job_id y url dados."""
    base_dir = Path(__file__).resolve().parent.parent / "data" / "processing"

    try:
        # ------------------- 1. DOWNLOAD & METADATA PHASE -------------------
        emit_event("download_started", job_id=job_id, step="downloading", progress=15)
        raw_meta = extract_metadata(url=url)
        
        # Normalizar metadata para satisfacer el MediaMetadata de Rust
        media_metadata = {
            "title": raw_meta.get("title", f"Video #{job_id}"),
            "uploader": raw_meta.get("author") or raw_meta.get("uploader", "Creador"),
            "duration": int(raw_meta.get("duration") or 0),
            "thumbnail": raw_meta.get("thumbnail", ""),
            "upload_date": str(raw_meta.get("upload_date", "")),
            "platform": raw_meta.get("platform", "unknown"),  # NUEVO
        }
        
        emit_event(
            name="metadata_extracted",
            job_id=job_id,
            step="metadata",
            progress=30,
            metadata=media_metadata,
            message=json.dumps(raw_meta)
        )
        
        video_path = download_video(url=url, job_id=job_id, base_dir=base_dir)
        emit_event(
            name="download_complete",
            job_id=job_id,
            step="extracting_audio",
            progress=50,
            metadata=media_metadata,
            message=video_path
        )

        # ------------------- 2. AUDIO EXTRACTION PHASE -------------------
        emit_event("transcription_started", job_id=job_id, step="transcribing", progress=65, metadata=media_metadata)
        audio_path = extract_audio(video_path=video_path)

        # ------------------- 3. TRANSCRIPTION PHASE -------------------
        transcript_result = transcribe_audio(audio_path=audio_path)
        transcript_text = transcript_result["text"] if isinstance(transcript_result, dict) else transcript_result
        segments = transcript_result.get("segments", []) if isinstance(transcript_result, dict) else []

        emit_event(
            name="transcription_complete",
            job_id=job_id,
            step="transcription_complete",
            progress=90,
            metadata=media_metadata,
            text=transcript_text,
            segments=segments
        )

        # ------------------- 4. COMPLETION PHASE -------------------
        emit_event(
            name="completed",
            job_id=job_id,
            step="complete",
            progress=100,
            metadata=media_metadata,
            text=transcript_text,
            segments=segments
        )

    except ValueError as e:
        emit_error(f"Error de validación: {str(e)}", job_id=job_id)
    except (FileNotFoundError, RuntimeError) as e:
        emit_error(f"Falla de pipeline: {str(e)}", job_id=job_id)
    except Exception as e:
        emit_error(f"Error nativo de Worker: {str(e)}", job_id=job_id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Pulsar Multimedia Processing Worker")
    parser.add_argument("--job_id", type=int, help="Job ID para ejecución individual")
    parser.add_argument("--url", type=str, help="URL del video para ejecución individual")

    args, unknown = parser.parse_known_args()

    # Si se especifican argumentos CLI, procesar ese único job
    if args.job_id is not None and args.url:
        process_single_job(args.job_id, args.url)
        return

    # De lo contrario, operar en modo Daemon leyendo STDIN en bucle (para Worker Pool Tokio)
    base_dir = Path(__file__).resolve().parent.parent / "data" / "processing"
    for raw_input in sys.stdin:
        if not raw_input.strip():
            continue

        try:
            job = JobInput.from_json(raw_input)

            if "tiktok.com" in job.url and ("playlist" in job.url or "/p/" in job.url):
                emit_event("playlist_detected", message=f"Extrayendo videos de playlist...", job_id=job.job_id, step="playlist", progress=10)
                video_urls = extract_playlist_videos(job.url)
                emit_event("playlist_extracted", message=json.dumps({"count": len(video_urls), "videos": video_urls}), job_id=job.job_id, step="playlist", progress=20)
                for idx, video_url in enumerate(video_urls):
                    sub_job_id = job.job_id * 1000 + idx
                    try:
                        emit_event("download_started", job_id=sub_job_id, step="downloading", progress=25)
                        raw_meta = extract_metadata(url=video_url)
                        media_metadata = {
                            "title": raw_meta.get("title", f"Video #{sub_job_id}"),
                            "uploader": raw_meta.get("author") or raw_meta.get("uploader", "Creador"),
                            "duration": int(raw_meta.get("duration") or 0),
                            "thumbnail": raw_meta.get("thumbnail", ""),
                            "upload_date": str(raw_meta.get("upload_date", "")),
                            "platform": raw_meta.get("platform", "unknown"),  # NUEVO
                        }
                        emit_event("metadata_extracted", message=json.dumps(raw_meta), job_id=sub_job_id, step="metadata", progress=30, metadata=media_metadata)
                        video_path = download_video(url=video_url, job_id=sub_job_id, base_dir=base_dir)
                        emit_event("download_complete", message=video_path, job_id=sub_job_id, step="extracting_audio", progress=50, metadata=media_metadata)
                        audio_path = extract_audio(video_path=video_path)
                        transcript_result = transcribe_audio(audio_path=audio_path)
                        transcript_text = transcript_result["text"] if isinstance(transcript_result, dict) else transcript_result
                        segments = transcript_result.get("segments", []) if isinstance(transcript_result, dict) else []
                        emit_event("transcription_complete", job_id=sub_job_id, step="transcription_complete", progress=90, metadata=media_metadata, text=transcript_text, segments=segments)
                        emit_event("completed", job_id=sub_job_id, step="complete", progress=100, metadata=media_metadata, text=transcript_text, segments=segments)
                    except Exception as e:
                        emit_error(f"Error procesando video de playlist {video_url}: {str(e)}", job_id=sub_job_id)
                continue

            process_single_job(job.job_id, job.url)
        except ValueError as e:
            emit_error(f"Error de validación payload: {str(e)}")
        except Exception as e:
            emit_error(f"Error general en stdin runner: {str(e)}")


if __name__ == "__main__":
    main()
