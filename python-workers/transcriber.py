"""
Pulsaria — Audio Transcriber (transcriber.py)
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
import shutil
import tempfile
from pathlib import Path

# ========================================================================
# TRANSCRIBER: STT nativo (Whisper / Faster-Whisper)
# Carga diferida (lazy import) para resiliencia en tiempo de importación
# ========================================================================

_whisper_model = None
_whisper_model_key: tuple[str, str, str, str | None] | None = None

_MODEL_FILES = ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt")
_MODEL_MINIMUM_SIZES = {
    "config.json": 128,
    "model.bin": 10_000_000,
    "tokenizer.json": 128,
    "vocabulary.txt": 128,
}


def _unique_paths(paths: list[Path]) -> list[Path]:
    result = []
    seen = set()
    for path in paths:
        resolved = str(path.expanduser().resolve())
        if resolved not in seen:
            seen.add(resolved)
            result.append(Path(resolved))
    return result


def _is_ready_model_directory(directory: Path) -> bool:
    if not directory.is_dir():
        return False
    for filename in _MODEL_FILES:
        path = directory / filename
        resolved = _resolve_snapshot_file(path)
        if (
            resolved is None
            or resolved.resolve() != path.resolve()
            or resolved.stat().st_size < _MODEL_MINIMUM_SIZES[filename]
        ):
            return False
    return True


def _resolve_snapshot_file(path: Path) -> Path | None:
    """Resolve Hugging Face cache pointer files on Windows."""
    if not path.is_file():
        return None
    try:
        pointer = path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeDecodeError):
        return path
    if pointer.startswith("../../blobs/"):
        blob = (path.parent / pointer).resolve()
        return blob if blob.is_file() else None
    return path


def _materialize_snapshot(snapshot: Path, destination: Path) -> Path | None:
    """Copy a cache snapshot, replacing Windows-incompatible pointer files."""
    sources = {
        filename: _resolve_snapshot_file(snapshot / filename)
        for filename in _MODEL_FILES
    }
    if any(
        source is None
        or not source.is_file()
        or source.stat().st_size < _MODEL_MINIMUM_SIZES[filename]
        for filename, source in sources.items()
    ):
        return None

    try:
        destination.mkdir(parents=True, exist_ok=True)
        for filename, source in sources.items():
            target = destination / filename
            if source.resolve() != target.resolve():
                shutil.copy2(source, target)
    except OSError as error:
        raise RuntimeError(
            f"No se pudo preparar la caché local de Whisper en {destination}: {error}"
        ) from error

    return destination if _is_ready_model_directory(destination) else None


def _snapshot_from_cache(cache_directory: Path) -> Path | None:
    if not cache_directory.is_dir():
        return None

    refs_main = cache_directory / "refs" / "main"
    revisions = []
    if refs_main.is_file():
        try:
            revision = refs_main.read_text(encoding="utf-8").strip()
            if revision:
                revisions.append(revision)
        except (OSError, UnicodeDecodeError):
            pass

    snapshots = cache_directory / "snapshots"
    if snapshots.is_dir():
        revisions.extend(
            child.name for child in snapshots.iterdir() if child.is_dir()
        )

    for revision in dict.fromkeys(revisions):
        snapshot = snapshots / revision
        if snapshot.is_dir():
            return snapshot
    return None


def _writable_model_cache(project_root: Path) -> Path:
    configured = os.environ.get("PULSAR_WHISPER_CACHE")
    if configured:
        return Path(configured).expanduser()

    data_dir = os.environ.get("PULSAR_DATA_DIR")
    if data_dir:
        return Path(data_dir).expanduser() / "whisper-models"

    download_dir = os.environ.get("PULSAR_DOWNLOAD_DIR")
    if download_dir:
        return Path(download_dir).expanduser() / "whisper-models"

    local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
    base = Path(local_app_data).expanduser() if local_app_data else Path.home()
    return base / "Pulsaria" / "whisper-models"


def _default_transcripts_root(project_root: Path) -> Path:
    """Resolve a durable transcript root without relying on the temp job dir."""
    configured = os.environ.get("PULSAR_TRANSCRIPTS_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()

    data_dir = os.environ.get("PULSAR_DATA_DIR", "").strip()
    if data_dir:
        return Path(data_dir).expanduser() / "transcripts"

    download_dir = os.environ.get("PULSAR_DOWNLOAD_DIR", "").strip()
    if download_dir:
        return Path(download_dir).expanduser() / ".pulsaria" / "transcripts"

    local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
    base = Path(local_app_data).expanduser() if local_app_data else Path.home()
    return base / "Pulsaria" / "transcripts"


def _runtime_root(project_root: Path) -> Path:
    configured = os.environ.get("PULSAR_RUNTIME_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser()
    if (project_root / "python").is_dir():
        return project_root
    return project_root / "src-tauri" / "resources"


def _safe_job_identifier(audio_path: Path, job_id: str | int | None) -> str:
    identifier = str(job_id) if job_id is not None else audio_path.parent.name
    safe_identifier = "".join(
        character for character in identifier if character.isalnum() or character in "-_"
    )
    return safe_identifier or "unknown-job"


def _durable_transcript_path(
    audio_path: Path,
    project_root: Path,
    transcript_path: str | Path | None,
    transcript_dir: str | Path | None,
    job_id: str | int | None,
) -> Path:
    """Return the durable transcript destination for one job."""
    if transcript_path is not None and str(transcript_path).strip():
        return Path(transcript_path).expanduser()

    configured_path = os.environ.get("PULSAR_TRANSCRIPT_PATH", "").strip()
    if configured_path:
        return Path(configured_path).expanduser()

    root = (
        Path(transcript_dir).expanduser()
        if transcript_dir is not None and str(transcript_dir).strip()
        else _default_transcripts_root(project_root)
    )
    return root / f"{_safe_job_identifier(audio_path, job_id)}.txt"


def _write_text_atomically(destination: Path, text: str) -> None:
    """Persist text durably without exposing a partially written transcript."""
    temporary_path: Path | None = None
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            dir=destination.parent,
            prefix=f".{destination.name}.",
            suffix=".part",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(text)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, destination)
    except OSError as error:
        raise RuntimeError(
            f"No se pudo guardar la transcripción durable en {destination}: {error}"
        ) from error
    finally:
        if temporary_path is not None:
            try:
                if temporary_path.exists():
                    temporary_path.unlink()
            except OSError:
                pass


def _persist_transcript(
    audio_path: Path,
    text: str,
    project_root: Path,
    transcript_path: str | Path | None,
    transcript_dir: str | Path | None,
    job_id: str | int | None,
) -> tuple[Path, Path]:
    """Write both the legacy adjacent file and the durable app-data copy."""
    legacy_path = audio_path.parent / "transcript.txt"
    durable_path = _durable_transcript_path(
        audio_path,
        project_root,
        transcript_path,
        transcript_dir,
        job_id,
    )

    destinations: list[Path] = []
    seen: set[str] = set()
    for destination in (legacy_path, durable_path):
        key = str(destination.expanduser().resolve())
        if key not in seen:
            seen.add(key)
            destinations.append(destination)

    for destination in destinations:
        _write_text_atomically(destination, text)
    return durable_path, legacy_path


def _local_model_directory(model_name: str, project_root: Path) -> Path | None:
    explicit = os.environ.get("PULSAR_WHISPER_MODEL_DIR") or os.environ.get(
        "WHISPER_MODEL_PATH"
    )
    candidates = []
    if explicit:
        candidates.append(Path(explicit).expanduser())

    named_path = Path(model_name).expanduser()
    if named_path.is_dir():
        candidates.append(named_path)

    model_cache_name = f"models--Systran--faster-whisper-{model_name}"
    cache_roots = _unique_paths(
        [_runtime_root(project_root) / "assets" / "models", _writable_model_cache(project_root)]
    )

    for root in cache_roots:
        candidates.append(root / model_name)
        cache_directory = root / model_cache_name
        snapshot = _snapshot_from_cache(cache_directory)
        if snapshot is None:
            continue
        if _is_ready_model_directory(snapshot):
            return snapshot
        materialized = _materialize_snapshot(
            snapshot,
            _writable_model_cache(project_root) / model_name / snapshot.name,
        )
        if materialized:
            return materialized

    for candidate in candidates:
        if _is_ready_model_directory(candidate):
            return candidate
        snapshot = _snapshot_from_cache(candidate)
        if snapshot and _is_ready_model_directory(snapshot):
            return snapshot

    return None


def get_model(_audio_path: Path):
    global _whisper_model, _whisper_model_key
    project_root = Path(__file__).resolve().parent.parent
    model_name = os.environ.get("WHISPER_MODEL", "tiny")
    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
    local_model = _local_model_directory(model_name, project_root)
    model_key = (
        model_name,
        device,
        compute_type,
        str(local_model) if local_model else None,
    )

    if _whisper_model is not None and _whisper_model_key == model_key:
        return _whisper_model

    _whisper_model = None
    _whisper_model_key = None
    try:
        from faster_whisper import WhisperModel

        model_source = str(local_model) if local_model else model_name
        try:
            _whisper_model = WhisperModel(
                model_size_or_path=model_source,
                device=device,
                compute_type=compute_type,
                download_root=str(_writable_model_cache(project_root)),
            )
        except Exception:
            if device != "cuda":
                raise
            # CUDA is optional in the portable bundle. A failed runtime
            # probe must never make an otherwise valid CPU job fail.
            _whisper_model = WhisperModel(
                model_size_or_path=model_source,
                device="cpu",
                compute_type="int8",
                download_root=str(_writable_model_cache(project_root)),
            )
        _whisper_model_key = model_key
    except Exception as e:
        raise RuntimeError(f"Fallo al cargar el motor Whisper: {e}")
    return _whisper_model

def transcribe_audio(
    audio_path: str,
    transcript_path: str | Path | None = None,
    transcript_dir: str | Path | None = None,
    job_id: str | int | None = None,
) -> dict:
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
            - 'transcript_path': str — Copia durable en la carpeta de datos
            - 'legacy_transcript_path': str — Ruta junto al audio de staging

    Raises:
        FileNotFoundError: Si el archivo de audio no existe.
        RuntimeError: Si falla la carga del modelo Whisper.
    """
    path = Path(audio_path).resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Archivo de audio no encontrado: {audio_path}")

    model = get_model(path)

    try:
        quality = int(os.environ.get("PULSAR_PROCESSING_QUALITY", "78"))
        beam_size = 3 if quality < 35 else 5 if quality < 72 else 8
        segments_gen, info = model.transcribe(
            str(path),
            beam_size=beam_size,
            best_of=beam_size,
            patience=1.0,
            temperature=0.0,
            condition_on_previous_text=True,
            vad_filter=True,
            word_timestamps=True,
        )
        segments_list = list(segments_gen)
    except Exception as e:
        raise RuntimeError(f"Fallo en inferencia Whisper: {e}")

    full_text_parts = []
    segments_data = []
    for seg in segments_list:
        text = seg.text.strip()
        full_text_parts.append(text)
        segment_data = {
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": text,
        }
        words = getattr(seg, "words", None) or []
        if words:
            segment_data["words"] = [
                {
                    "start": round(word.start, 3),
                    "end": round(word.end, 3),
                    "word": word.word.strip(),
                }
                for word in words
            ]
        segments_data.append(segment_data)

    final_text = " ".join(full_text_parts).strip()

    # An empty transcript is valid (for example, a video without dialogue),
    # but its durable marker must still be written so restart/reconciliation
    # can distinguish "processed and empty" from "never transcribed".
    project_root = Path(__file__).resolve().parent.parent
    durable_path, legacy_path = _persist_transcript(
        path,
        final_text,
        project_root,
        transcript_path,
        transcript_dir,
        job_id,
    )

    return {
        "text": final_text,
        "segments": segments_data,
        "language": info.language if info else "unknown",
        "duration": round(info.duration, 2) if info else 0,
        "transcript_path": str(durable_path),
        "legacy_transcript_path": str(legacy_path),
    }
