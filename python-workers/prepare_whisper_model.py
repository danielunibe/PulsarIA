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

from huggingface_hub import snapshot_download


PINNED_REVISIONS = {
    "tiny": "d90ca5fe260221311c53c58e660288d3deb8d356",
    "small": "536b0662742c02347bc0e980a01041f333bce120",
    "medium": "08e178d48790749d25932bbc082711ddcfdfbc4f",
}
REQUIRED_FILES = ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt")


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


def prepare(model: str, cache_root: Path) -> dict:
    revision = PINNED_REVISIONS[model]
    destination = cache_root / model
    if destination.is_dir():
        try:
            files = validate_install(destination, model, revision)
            return {"status": "ready", "model": model, "revision": revision, "path": str(destination), "files": files}
        except Exception:
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
    )
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
    staging.replace(destination)
    return {"status": "ready", "path": str(destination), **manifest}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=sorted(PINNED_REVISIONS), required=True)
    parser.add_argument("--cache-root", type=Path, required=True)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    try:
        revision = PINNED_REVISIONS[args.model]
        destination = args.cache_root / args.model
        if args.check_only:
            files = validate_model(destination)
            result = {"status": "ready", "model": args.model, "revision": revision, "path": str(destination), "files": files}
        else:
            result = prepare(args.model, args.cache_root)
        print(json.dumps(result), flush=True)
        return 0
    except Exception as error:
        print(json.dumps({"status": "error", "model": args.model, "message": str(error)}), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
