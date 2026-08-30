import json
import sys
from typing import Optional, Dict, Any, List

# ========================================================================
# EVENTS IPC: Canal de comunicación con el puente Rust
# Imprime un JSON-Line al STDOUT forzando un flush inmediato para evitar 
# el buffering pasivo del OS. 
# Compatible tanto con queue.rs (ProgressEvent) como con python_runner.rs (WorkerEvent).
# ========================================================================

def emit_event(
    name: str, 
    job_id: Optional[int] = None,
    step: Optional[str] = None,
    progress: int = 0,
    metadata: Optional[Dict[str, Any]] = None,
    message: Optional[str] = None,
    text: Optional[str] = None,
    segments: Optional[List[Dict[str, Any]]] = None,
    visual_analysis: Optional[Dict[str, Any]] = None,
    instructional_guide: Optional[str] = None,
) -> None:
    """Emite un evento estandarizado asimilable por Rust vía STDOUT."""
    payload: Dict[str, Any] = {
        "event": name,
        "step": step or name,
        "progress": progress
    }
    
    if job_id is not None:
        payload["job"] = job_id
        payload["job_id"] = job_id
    if metadata is not None:
        payload["metadata"] = metadata
    if message is not None:
        payload["message"] = str(message)
    if text is not None:
        payload["text"] = text
    if segments is not None:
        payload["segments"] = segments
    if visual_analysis is not None:
        payload["visual_analysis"] = visual_analysis
    if instructional_guide is not None:
        payload["instructional_guide"] = instructional_guide
    
    print(json.dumps(payload), flush=True)


def emit_error(msg: str, job_id: Optional[int] = None) -> None:
    """Emite un evento de error crítico obligando al Runner a reportar DLQ/Retry."""
    emit_event(
        name="error", 
        job_id=job_id, 
        step="error", 
        progress=0,
        message=msg,
        text=msg,
    )
    print(f"CRITICAL ERROR: {msg}", file=sys.stderr, flush=True)
