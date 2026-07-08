from dataclasses import dataclass
import json

# ========================================================================
# MODELS: Transacciones de Dominio entre Lenguajes
# Paridad estricta con Rust's WorkerPayload.
# ========================================================================

@dataclass
class JobInput:
    job_id: int
    url: str

    @classmethod
    def from_json(cls, raw_json: str) -> "JobInput":
        """Rehidrata el payload deserializando un JSON-Line"""
        try:
            data = json.loads(raw_json.strip())
            return cls(
                job_id=int(data["job_id"]),
                url=str(data["url"])
            )
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            raise ValueError(f"Payload inválido o incompleto: {str(e)}")
