from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


JOB_TABLES = (
    "playlist_items",
    "media_artifacts",
    "generated_outputs",
    "transcript_segments",
    "transcript_embeddings",
    "collection_source_items",
    "collection_source_activity",
    "media",
)


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def load_jobs(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute(
        "SELECT id, url, status, created_at FROM jobs ORDER BY id"
    ).fetchall()
    return [
        {"id": row[0], "url": row[1], "status": row[2], "created_at": row[3]}
        for row in rows
    ]


def backup_database(database: Path, backup_path: Path) -> None:
    source = sqlite3.connect(database)
    target = sqlite3.connect(backup_path)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset reversible del entorno tester de Pulsaria")
    parser.add_argument("--database", required=True)
    parser.add_argument("--backup-dir", required=True)
    parser.add_argument("--confirm", action="store_true")
    args = parser.parse_args()

    database = Path(args.database).resolve()
    backup_dir = Path(args.backup_dir).resolve()
    if not database.is_file():
        print(json.dumps({"ok": False, "error": f"No existe SQLite: {database}"}, ensure_ascii=False))
        return 2

    connection = sqlite3.connect(database)
    connection.execute("PRAGMA foreign_keys = ON")
    jobs = load_jobs(connection)
    job_ids = [int(job["id"]) for job in jobs]
    summary = {"database": str(database), "jobCount": len(jobs), "jobs": jobs}

    if not args.confirm:
        print(json.dumps({"ok": True, "preview": True, **summary}, ensure_ascii=False, indent=2))
        connection.close()
        return 0

    backup_dir.mkdir(parents=True, exist_ok=False)
    backup_db = backup_dir / "library.db"
    backup_database(database, backup_db)
    manifest = backup_dir / "reset-manifest.json"
    manifest.write_text(json.dumps({"createdAt": datetime.now(timezone.utc).isoformat(), **summary}, ensure_ascii=False, indent=2), encoding="utf-8")

    index_backups: list[str] = []
    for index in database.parent.glob("vector_index_shard_*.hnsw"):
        destination = backup_dir / index.name
        shutil.copy2(index, destination)
        index.unlink()
        index_backups.append(str(index))

    if job_ids:
        placeholders = ",".join("?" for _ in job_ids)
        connection.execute("BEGIN")
        try:
            output_rows = connection.execute(
                f"SELECT id FROM generated_outputs WHERE job_id IN ({placeholders})", job_ids
            ).fetchall()
            output_ids = [row[0] for row in output_rows]
            if output_ids:
                output_placeholders = ",".join("?" for _ in output_ids)
                connection.execute(
                    f"DELETE FROM generated_output_purge WHERE output_id IN ({output_placeholders})",
                    output_ids,
                )
            for table in JOB_TABLES:
                connection.execute(f"DELETE FROM {table} WHERE job_id IN ({placeholders})", job_ids)
            connection.execute(f"DELETE FROM jobs WHERE id IN ({placeholders})", job_ids)
            connection.execute("COMMIT")
        except Exception:
            connection.execute("ROLLBACK")
            connection.close()
            raise
    connection.close()

    print(json.dumps({
        "ok": True,
        "preview": False,
        **summary,
        "backup": str(backup_dir),
        "indexesRemovedForRebuild": index_backups,
        "mediaPreserved": True,
        "note": "Los videos, audios, transcripciones y posters físicos se conservaron; requieren revisión explícita para eliminarse.",
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
