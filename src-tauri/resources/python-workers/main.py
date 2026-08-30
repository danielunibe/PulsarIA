import argparse
import json
import os
import sys

from pathlib import Path

# Componentes del pipeline separados por responsabilidad
from models import JobInput
from events import emit_event, emit_error
from downloader import download_video, extract_metadata, extract_playlist_videos
from audio_extractor import extract_audio
from transcriber import transcribe_audio
from visual_analyzer import analyze_video

# ========================================================================
# MAIN ORCHESTRATOR: IPC Worker Entrypoint
# Responsabilidad: Orquestar el pipeline multimedia y emitir el estado
# tanto para invocaciones CLI individuales (--job_id, --url) como para
# modo daemon persistente vía STDIN (para WorkerPool).
# ========================================================================

def processing_base_dir() -> Path:
    configured_dir = os.environ.get("PULSAR_DOWNLOAD_DIR")
    if configured_dir:
        return Path(configured_dir).expanduser() / "processing"
    return Path(__file__).resolve().parent.parent / "data" / "processing"


def process_single_job(job_id: int, url: str) -> None:
    """Ejecuta el pipeline completo para un job_id y url dados."""
    base_dir = processing_base_dir()

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

        # ------------------- 4. VISUAL ANALYSIS PHASE -------------------
        try:
            visual_result = analyze_video(
                video_path=video_path,
                duration_seconds=media_metadata.get("duration"),
                transcript=transcript_text,
            )
            visual_analysis = {
                key: value for key, value in visual_result.items() if key != "json"
            }
            instructional_guide = visual_result.get("instructional_guide", "")
            emit_event(
                name="visual_analysis",
                job_id=job_id,
                step="visual_analysis",
                progress=95,
                metadata=media_metadata,
                text=transcript_text,
                segments=segments,
                visual_analysis=visual_analysis,
                instructional_guide=instructional_guide,
            )
        except Exception as error:
            # La transcripción sigue siendo utilizable si OCR/Pillow/FFmpeg no
            # están disponibles; el error queda explícito para diagnóstico.
            visual_analysis = {
                "schema_version": 1,
                "analysis_mode": "unavailable",
                "error": str(error)[:600],
            }
            instructional_guide = (
                "# Instructivo audiovisual\\n\\n"
                "El análisis visual no estuvo disponible en este equipo. "
                f"Detalle: {str(error)[:600]}"
            )
            emit_event(
                name="visual_analysis",
                job_id=job_id,
                step="visual_analysis",
                progress=95,
                metadata=media_metadata,
                text=transcript_text,
                segments=segments,
                visual_analysis=visual_analysis,
                instructional_guide=instructional_guide,
            )

        # ------------------- 5. COMPLETION PHASE -------------------
        emit_event(
            name="completed",
            job_id=job_id,
            step="complete",
            progress=100,
            metadata=media_metadata,
            text=transcript_text,
            segments=segments,
            visual_analysis=visual_analysis,
            instructional_guide=instructional_guide,
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
    parser.add_argument("--expand-url", type=str, help="Expandir un perfil, playlist o feed público a URLs de videos")

    args, unknown = parser.parse_known_args()

    if args.expand_url:
        try:
            print(json.dumps(extract_playlist_videos(args.expand_url)), flush=True)
        except Exception as error:
            print(json.dumps({"error": str(error)}), flush=True)
            raise SystemExit(1)
        return

    # Si se especifican argumentos CLI, procesar ese único job

    if args.job_id is not None and args.url:
        process_single_job(args.job_id, args.url)
        return

    # De lo contrario, operar en modo Daemon leyendo STDIN en bucle (para Worker Pool Tokio)
    base_dir = processing_base_dir()
    for raw_input in sys.stdin:

        if not raw_input.strip():
            continue

        try:
            job = JobInput.from_json(raw_input)

            process_single_job(job.job_id, job.url)

        except ValueError as e:
            emit_error(f"Error de validación payload: {str(e)}")
        except Exception as e:
            emit_error(f"Error general en stdin runner: {str(e)}")


if __name__ == "__main__":
    main()
