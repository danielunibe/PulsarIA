import json
import sys

# ========================================================================
# EVENTS IPC: Canal de comunicación con el puente Rust (PythonRunner)
# Imprime un JSON-Line al STDOUT forzando un flush inmediato para evitar 
# el buffering pasivo del OS. 
# ========================================================================

def emit_event(name: str, message: str = None) -> None:
    """Emite un evento estandarizado asimilable por Rust vía STDOUT."""
    payload = {"event": name}
    if message:
        payload["message"] = str(message)
    
    print(json.dumps(payload), flush=True)


def emit_error(msg: str) -> None:
    """Emite un evento de error crítico obligando al Runner a reportar DLQ/Retry."""
    emit_event("error", message=msg)
    # También forzamos el log al stderr pasivo por si se requiere debugging avanzado
    print(f"CRITICAL ERROR: {msg}", file=sys.stderr, flush=True)

