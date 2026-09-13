"""Export sentence-transformers/all-MiniLM-L6-v2 to ONNX for Pulsaria bundle."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

def main() -> int:
    parser = argparse.ArgumentParser(description="Export embedding model to ONNX")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1] / "src-tauri" / "resources" / "models")
    args = parser.parse_args()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    print(json.dumps({"status": "exporting", "output": str(output_dir)}), flush=True)
    try:
        from optimum.exporters.onnx import main_export
    except ImportError:
        print(json.dumps({"status": "error", "message": "optimum[onnxruntime] not installed. Run: pip install optimum[onnxruntime] sentence-transformers"}))
        return 1
    try:
        main_export(
            "sentence-transformers/all-MiniLM-L6-v2",
            output=output_dir,
            task="feature-extraction",
        )
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"status": "error", "message": str(exc)}))
        return 1
    print(json.dumps({"status": "ready", "output": str(output_dir), "files": [p.name for p in output_dir.iterdir()]}))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

