"""Download and validate a pinned Faster-Whisper model for Pulsaria."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import time
from pathlib import Path

from tqdm.auto import tqdm

from huggingface_hub import snapshot_download


PINNED_REVISIONS = {
    "tiny": "d90ca5fe260221311c53c58e660288d3deb8d356",
    "small": "536b0662742c02347bc0e980a01041f333bce120",
    "medium": "08e178d48790749d25932bbc082711ddcfdfbc4f",
}
REQUIRED_FILES = ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt")


class PulsariaProgress(tqdm):
    """Emit machine-readable aggregate download progress for the Tauri bridge."""

    _lock = __import__("threading").Lock()
    _bars: set["PulsariaProgress"] = set()
    _last_sample: tuple[float, int] | None = None
    _throughput: float | None = None

    def __init__(self, *args, **kwargs):
        kwargs["disable"] = True
        super().__init__(*args, **kwargs)
        with self._lock:
            self._bars.add(self)

    def update(self, n=1):
        result = super().update(n)
        with self._lock:
            total = sum(int(bar.total or 0) for bar in self._bars)
            downloaded = sum(int(bar.n) for bar in self._bars)
            now = time.monotonic()
            eta_seconds = None
            if self._last_sample is not None:
                previous_time, previous_bytes = self._last_sample
                delta_time = now - previous_time
                delta_bytes = downloaded - previous_bytes
                if delta_time >= 0.5 and delta_bytes > 0:
                    current_rate = delta_bytes / delta_time
                    alpha = 0.25
                    self._throughput = current_rate if self._throughput is None else alpha * current_rate + (1 - alpha) * self._throughput
            self._last_sample = (now, downloaded)
            if total > 0 and self._throughput and self._throughput > 0:
                remaining = max(0, total - downloaded)
                eta_seconds = max(0, round(remaining / self._throughput))
        print(json.dumps({
            "status": "downloading",
            "downloaded_bytes": downloaded,
            "total_bytes": total or None,
            "eta_seconds": eta_seconds,
        }), flush=True)
        return result

    def close(self):
        with self._lock:
            self._bars.discard(self)
        return super().close()


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def validate_model(directory: Path, load: bool = True) -> dict:
    files = {}
    for name in REQUIRED_FILES:
        path = directory / name
        if not path.is_file() or path.stat().st_size < 128:
            raise RuntimeError(f"Modelo incompleto: {name} no existe o está vacío")
        files[name] = {"size": path.stat().st_size, "sha256": digest(path)}
    if files["model.bin"]["size"] < 10_000_000:
        raise RuntimeError("Modelo incompleto: model.bin es demasiado pequeño")
    if load:
        print(json.dumps({"status": "validating"}), flush=True)
        from faster_whisper import WhisperModel

        WhisperModel(str(directory), device="cpu", compute_type="int8")
    return files


def validate_install(directory: Path, model: str, revision: str) -> dict:
    manifest_path = directory / "pulsaria-model-manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError("La instalación existente no tiene manifiesto verificable")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("model") != model or manifest.get("revision") != revision:
        raise RuntimeError("La instalación existente no usa la revisión fijada")
    files = validate_model(directory)
    if manifest.get("files") != files:
        raise RuntimeError("La instalación existente no coincide con sus hashes")
    return files


def repair_files(staging: Path, destination: Path, files: tuple[str, ...] = REQUIRED_FILES) -> list[str]:
    """Replace only missing/invalid files; preserve valid destination files."""
    replaced = []
    destination.mkdir(parents=True, exist_ok=True)
    for name in files:
        source = staging / name
        target = destination / name
        if not target.is_file() or digest(target) != digest(source):
            shutil.copy2(source, target)
            replaced.append(name)
    manifest = staging / "pulsaria-model-manifest.json"
    if manifest.is_file():
        shutil.copy2(manifest, destination / manifest.name)
    return replaced


def prepare(model: str, cache_root: Path, repair: bool = False, start_phase: str = "downloading") -> dict:
    if start_phase not in {"downloading", "verifying", "preparing", "validating"}:
        raise ValueError(f"Fase de inicio no válida: {start_phase}")
    revision = PINNED_REVISIONS[model]
    destination = cache_root / model
    if start_phase != "downloading" and destination.is_dir():
        print(json.dumps({"status": start_phase, "model": model, "resumed": True}), flush=True)
        files = validate_model(destination)
        return {"status": "ready", "model": model, "revision": revision, "path": str(destination), "files": files}
    if destination.is_dir():
        try:
            files = validate_install(destination, model, revision)
            return {"status": "ready", "model": model, "revision": revision, "path": str(destination), "files": files}
        except Exception:
            if repair:
                # Keep the destination and replace only files that fail the
                # existing manifest. Hugging Face still downloads into an
                # isolated staging directory, so shared cache blobs are not
                # modified directly.
                existing_manifest = {}
                manifest_path = destination / "pulsaria-model-manifest.json"
                if manifest_path.is_file():
                    try:
                        existing_manifest = json.loads(manifest_path.read_text(encoding="utf-8")).get("files", {})
                    except (OSError, ValueError):
                        existing_manifest = {}
                invalid = []
                for name in REQUIRED_FILES:
                    expected = existing_manifest.get(name, {})
                    path = destination / name
                    if not path.is_file() or path.stat().st_size != expected.get("size") or digest(path) != expected.get("sha256"):
                        invalid.append(name)
                if invalid:
                    print(json.dumps({"status": "downloading", "model": model, "repair_files": invalid}), flush=True)
                else:
                    invalid = list(REQUIRED_FILES)
            else:
                quarantine = destination.with_name(f"{destination.name}.corrupt-{int(time.time())}")
                destination.rename(quarantine)

    staging = cache_root / ".staging" / f"{model}-{os.getpid()}"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)
    print(json.dumps({"status": "downloading", "model": model, "revision": revision}), flush=True)
    snapshot_download(
        repo_id=f"Systran/faster-whisper-{model}",
        revision=revision,
        local_dir=staging,
        allow_patterns=list(REQUIRED_FILES),
        tqdm_class=PulsariaProgress,
    )
    print(json.dumps({"status": "verifying", "model": model}), flush=True)
    files = validate_model(staging)
    manifest = {
        "model": model,
        "revision": revision,
        "created_at": int(time.time()),
        "files": files,
    }
    (staging / "pulsaria-model-manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    if repair and destination.is_dir():
        repair_files(staging, destination)
        shutil.rmtree(staging)
    else:
        staging.replace(destination)
    print(json.dumps({"status": "preparing", "model": model}), flush=True)
    return {"status": "ready", "path": str(destination), **manifest}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=sorted(PINNED_REVISIONS), required=True)
    parser.add_argument("--cache-root", type=Path, required=True)
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--repair", action="store_true")
    parser.add_argument("--start-phase", choices=("downloading", "verifying", "preparing", "validating"), default="downloading")
    args = parser.parse_args()
    try:
        revision = PINNED_REVISIONS[args.model]
        destination = args.cache_root / args.model
        if args.check_only:
            files = validate_model(destination)
            result = {"status": "ready", "model": args.model, "revision": revision, "path": str(destination), "files": files}
        else:
            result = prepare(args.model, args.cache_root, repair=args.repair, start_phase=args.start_phase)
        print(json.dumps(result), flush=True)
        return 0
    except Exception as error:
        print(json.dumps({"status": "error", "model": args.model, "message": str(error)}), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
