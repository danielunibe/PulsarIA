#!/usr/bin/env python3
"""
Pulsaria — HNSW Snapshot Backup Script
Sprint Hardening — Área E14

Respalda automáticamente los snapshots del índice HNSW a S3/GCS.
Política de retención: 90 días en S3.

Uso:
    pip install boto3
    python scripts/backup_snapshots.py --data-dir data/ --bucket pulsar-backups

Variables de entorno necesarias:
    AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY
    AWS_DEFAULT_REGION  (default: us-east-1)
    S3_BUCKET           (override del argumento --bucket)
"""

import argparse
import gzip
import hashlib
import json
import os
import shutil
import sys
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path

# ─── Dependencias opcionales ─────────────────────────────────────────────
try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
    S3_AVAILABLE = True
except ImportError:
    S3_AVAILABLE = False

# ─── Config ──────────────────────────────────────────────────────────────
RETENTION_DAYS = 90
TIMESTAMP_FMT  = "%Y%m%d_%H%M%S"
BACKUP_PREFIX  = "hnsw-backups"

def parse_args():
    p = argparse.ArgumentParser(description="Pulsar HNSW Snapshot Backup")
    p.add_argument("--data-dir",  default="data",          help="Directorio de snapshots HNSW")
    p.add_argument("--bucket",    default=os.getenv("S3_BUCKET", "pulsar-backups"), help="Bucket S3")
    p.add_argument("--local-dir", default="backups",       help="Dir local temporal para archives")
    p.add_argument("--dry-run",   action="store_true",     help="Simula sin subir a S3")
    p.add_argument("--restore",   metavar="BACKUP_KEY",    help="Restaura un backup específico")
    return p.parse_args()

# ─── Utilidades ──────────────────────────────────────────────────────────
def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def find_snapshots(data_dir: Path) -> list[Path]:
    patterns = ["*.hnsw", "*.hnsw.tmp"]
    files = []
    for pattern in patterns:
        files.extend(data_dir.glob(pattern))
    return sorted(files)

# ─── Backup ──────────────────────────────────────────────────────────────
def create_archive(snapshots: list[Path], local_dir: Path, timestamp: str) -> Path:
    local_dir.mkdir(parents=True, exist_ok=True)
    archive_name = f"hnsw-{timestamp}.tar.gz"
    archive_path = local_dir / archive_name

    print(f"  📦 Creando archive: {archive_path}")
    checksums = {}

    with tarfile.open(archive_path, "w:gz") as tar:
        for snap in snapshots:
            checksums[snap.name] = sha256_file(snap)
            tar.add(snap, arcname=snap.name)
            print(f"     + {snap.name}  ({snap.stat().st_size // 1024} KB)")

    # Guardar manifest JSON junto al archive
    manifest = {
        "timestamp": timestamp,
        "files": checksums,
        "archive": archive_name,
        "size_bytes": archive_path.stat().st_size,
    }
    manifest_path = local_dir / f"hnsw-{timestamp}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"  📄 Manifest: {manifest_path}")

    return archive_path

def upload_to_s3(archive_path: Path, manifest_path: Path, bucket: str, timestamp: str):
    if not S3_AVAILABLE:
        print("  ⚠️  boto3 no instalado — pip install boto3")
        return False

    try:
        s3 = boto3.client("s3")
        prefix = f"{BACKUP_PREFIX}/{timestamp[:8]}"  # Agrupar por día

        for path in [archive_path, manifest_path]:
            key = f"{prefix}/{path.name}"
            print(f"  ☁️  Subiendo → s3://{bucket}/{key}")
            s3.upload_file(
                str(path), bucket, key,
                ExtraArgs={"StorageClass": "STANDARD_IA"}  # Cheaper for backups
            )

        # Configurar lifecycle rule por código (idempotente)
        _ensure_retention_policy(s3, bucket)
        return True

    except NoCredentialsError:
        print("  ❌ No hay credenciales AWS configuradas.")
        return False
    except ClientError as e:
        print(f"  ❌ Error S3: {e}")
        return False

def _ensure_retention_policy(s3_client, bucket: str):
    """Crea/actualiza la política de retención de 90 días (idempotente)."""
    try:
        s3_client.put_bucket_lifecycle_configuration(
            Bucket=bucket,
            LifecycleConfiguration={
                "Rules": [{
                    "ID": "pulsar-hnsw-retention-90d",
                    "Status": "Enabled",
                    "Prefix": BACKUP_PREFIX,
                    "Expiration": {"Days": RETENTION_DAYS},
                }]
            }
        )
    except ClientError:
        pass  # Puede fallar si no hay permisos — no es crítico

# ─── Restore ─────────────────────────────────────────────────────────────
def restore_from_s3(backup_key: str, bucket: str, data_dir: Path, local_dir: Path):
    if not S3_AVAILABLE:
        print("  ❌ boto3 no disponible")
        sys.exit(1)

    local_dir.mkdir(parents=True, exist_ok=True)
    archive_path = local_dir / Path(backup_key).name

    print(f"  ⬇️  Descargando s3://{bucket}/{backup_key}")
    boto3.client("s3").download_file(bucket, backup_key, str(archive_path))

    print(f"  📂 Extrayendo a {data_dir}/")
    data_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive_path, "r:gz") as tar:
        tar.extractall(data_dir)

    print("  ✅ Restore completado. Reiniciar el engine para cargar el índice.")

# ─── Main ────────────────────────────────────────────────────────────────
def main():
    args = parse_args()
    data_dir  = Path(args.data_dir)
    local_dir = Path(args.local_dir)

    if args.restore:
        restore_from_s3(args.restore, args.bucket, data_dir, local_dir)
        return

    timestamp = datetime.now(timezone.utc).strftime(TIMESTAMP_FMT)
    snapshots = find_snapshots(data_dir)

    print(f"\n{'='*55}")
    print(f"  Pulsar HNSW Backup — {timestamp}")
    print(f"  Snapshots en {data_dir}: {len(snapshots)} archivo(s)")
    print(f"{'='*55}")

    if not snapshots:
        print("  ⚠️  No hay snapshots HNSW en el directorio. Nada que respaldar.")
        sys.exit(0)

    archive_path = create_archive(snapshots, local_dir, timestamp)
    manifest_path = local_dir / f"hnsw-{timestamp}.manifest.json"

    if not args.dry_run:
        success = upload_to_s3(archive_path, manifest_path, args.bucket, timestamp)
        if success:
            print(f"\n  ✅ Backup completado: s3://{args.bucket}/{BACKUP_PREFIX}/{timestamp[:8]}/")
        else:
            print(f"\n  📁 Backup local: {archive_path}")
    else:
        print(f"\n  🔍 [DRY RUN] archive listo: {archive_path}")

    print(f"  Retención configurada: {RETENTION_DAYS} días\n")

if __name__ == "__main__":
    main()
