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
import shutil
from pathlib import Path

# ========================================================================
# TRANSCRIBER: STT nativo (Whisper / Faster-Whisper)
# Carga diferida (lazy import) para resiliencia en tiempo de importación
# ========================================================================

_whisper_model = None

_MODEL_FILES = ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt")


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
        if resolved is None or resolved.resolve() != path.resolve():
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
    if any(source is None for source in sources.values()):
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

    return project_root / "data" / "whisper-models"


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
        [
            project_root / "assets" / "models",
            project_root / "resources" / "assets" / "models",
            project_root / "src-tauri" / "resources" / "assets" / "models",
            project_root / "data" / "assets" / "models",
            _writable_model_cache(project_root),
        ]
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
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            project_root = Path(__file__).resolve().parent.parent
            model_name = os.environ.get("WHISPER_MODEL", "tiny")
            device = os.environ.get("WHISPER_DEVICE", "cpu")
            compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
            local_model = _local_model_directory(model_name, project_root)
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
