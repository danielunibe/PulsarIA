import json
import sys
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any

# ========================================================================
# EVENTS IPC: Canal de comunicación con el puente Rust (PythonRunner)
# Imprime un JSON-Line al STDOUT forzando un flush inmediato para evitar 
# el buffering pasivo del OS. 
# ========================================================================

@dataclass
class MediaMetadata:
    title: str
    uploader: str
    thumbnail: str
    duration: int
    upload_date: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def emit_event(name: str, job_id: int = 0, message: str = None, metadata: Optional[MediaMetadata] = None, text: str = None) -> None:
    """Emite un evento estandarizado asimilable por Rust vía STDOUT."""
    payload = {"event": name, "job_id": job_id}
    if message:
        payload["message"] = str(message)
    if metadata:
        payload["metadata"] = metadata.to_dict()
    if text:
        payload["text"] = str(text)
    
    print(json.dumps(payload), flush=True)


def emit_error(msg: str, job_id: int = 0) -> None:
    """Emite un evento de error crítico obligando al Runner a reportar DLQ/Retry."""
    emit_event("error", job_id=job_id, message=msg)
    # También forzamos el log al stderr pasivo por si se requiere debugging avanzado
    print(f"CRITICAL ERROR: {msg}", file=sys.stderr, flush=True)

