"""Seed a test-owned video reference into an isolated installed smoke library."""

import argparse
import json
import os
import sqlite3
import sys


def emit(payload: dict[str, object]) -> None:
    print(json.dumps(payload, separators=(",", ":")))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("seed", "verify"), required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--media-path", required=True)
    parser.add_argument("--job-id", type=int)
    args = parser.parse_args()

    if not os.path.isfile(args.database):
        raise RuntimeError("The isolated installed library database does not exist")
    if not os.path.isfile(args.media_path):
        raise RuntimeError("The synthetic video fixture does not exist")

    connection = sqlite3.connect(args.database, timeout=30)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        if args.mode == "seed":
            synthetic_url = "https://synthetic.invalid/" + os.path.basename(args.media_path)
            cursor = connection.execute(
                "INSERT INTO jobs (url, canonical_url, status, progress) VALUES (?, ?, 'completed', 100)",
                (synthetic_url, synthetic_url),
            )
            job_id = int(cursor.lastrowid)
            connection.execute(
                "INSERT INTO media (job_id, title, author, duration, video_path, platform, source_state) "
                "VALUES (?, 'Synthetic installed smoke video', 'Pulsaria CI', 2, ?, 'synthetic', 'local')",
                (job_id, args.media_path),
            )
            connection.commit()
        else:
            if args.job_id is None:
                raise RuntimeError("Verification requires the synthetic job ID")
            job_id = args.job_id

        row = connection.execute(
            "SELECT jobs.id, media.video_path, media.platform "
            "FROM jobs JOIN media ON media.job_id = jobs.id WHERE jobs.id = ?",
            (job_id,),
        ).fetchone()
        if row is None or row[1] != args.media_path or row[2] != "synthetic":
            raise RuntimeError("The synthetic media reference was not persisted exactly")
        emit({
            "mode": args.mode,
            "jobId": job_id,
            "recordedPathMatches": row[1] == args.media_path,
            "videoExists": os.path.isfile(args.media_path),
            "platform": row[2],
        })
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001 - emit one sanitized smoke failure
        print(json.dumps({"error": str(error)}, separators=(",", ":")), file=sys.stderr)
        raise SystemExit(1)
