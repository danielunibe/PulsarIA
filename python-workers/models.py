"""
Pulsaria — Domain Models (models.py)
============================================

Modelos de dominio compartidos entre workers Python y el backend Rust.

Estos dataclasses representan las transacciones de datos que viajan
entre los workers y el orchestrator (main.py). Mantienen paridad
estRICTA con los structs de Rust en `queue.rs` (ProgressEvent, MediaMetadata).
"""
from dataclasses import dataclass
import json

# ========================================================================
# MODELS: Transacciones de Dominio entre Lenguajes
# Paridad estricta con Rust's WorkerPayload.
# ========================================================================

@dataclass
class JobInput:
    """
    Entrada de un job para procesamiento.

    Attributes:
        job_id: ID del job en la base de datos SQLite.
        url: URL del video a procesar.
    """
    job_id: int
    url: str

    @classmethod
    def from_json(cls, raw_json: str) -> "JobInput":
        """
        Deserializa un JobInput desde una línea JSON.

        Args:
            raw_json: String JSON con campos 'job_id' y 'url'.

        Returns:
            Instancia de JobInput.

        Raises:
            ValueError: Si el JSON es inválido o falta algún campo.
        """
        try:
            data = json.loads(raw_json.strip())
            return cls(
                job_id=int(data["job_id"]),
                url=str(data["url"])
            )
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            raise ValueError(f"Payload inválido o incompleto: {str(e)}")
