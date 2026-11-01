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
    parser.add_argument(
        "--mode", choices=("seed", "verify", "set-path", "verify-state"), required=True
    )
    parser.add_argument("--database", required=True)
    parser.add_argument("--media-path", required=True)
    parser.add_argument("--job-id", type=int)
    parser.add_argument("--expected-state", choices=("local", "storage_offline"))
    args = parser.parse_args()

    if not os.path.isfile(args.database):
        raise RuntimeError("The isolated installed library database does not exist")
    if args.mode != "verify-state" and not os.path.isfile(args.media_path):
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
        elif args.mode == "verify":
            if args.job_id is None:
                raise RuntimeError("Verification requires the synthetic job ID")
            job_id = args.job_id

        elif args.mode == "set-path":
            if args.job_id is None:
                raise RuntimeError("Path update requires the synthetic job ID")
            updated = connection.execute(
                "UPDATE media SET video_path = ?, source_state = 'local' "
                "WHERE job_id = ? AND platform = 'synthetic'",
                (args.media_path, args.job_id),
            )
            if updated.rowcount != 1:
                raise RuntimeError("Could not update exactly one synthetic media reference")
            connection.commit()
            job_id = args.job_id

        if args.mode in ("seed", "verify", "set-path"):
            row = connection.execute(
                "SELECT jobs.id, media.video_path, media.platform, media.source_state "
                "FROM jobs JOIN media ON media.job_id = jobs.id WHERE jobs.id = ?",
                (job_id,),
            ).fetchone()
            if row is None or row[1] != args.media_path or row[2] != "synthetic":
                raise RuntimeError("The synthetic media reference was not persisted exactly")
            if args.mode == "set-path" and row[3] != "local":
                raise RuntimeError("The synthetic media reference was not reset to local")
            emit({
                "mode": args.mode,
                "jobId": job_id,
                "recordedPathMatches": row[1] == args.media_path,
                "videoExists": os.path.isfile(args.media_path),
                "sourceState": row[3],
                "platform": row[2],
            })
        else:
            if args.job_id is None or args.expected_state is None:
                raise RuntimeError("State verification requires a job ID and expected state")
            row = connection.execute(
                "SELECT jobs.status, media.video_path, media.platform, media.source_state "
                "FROM jobs JOIN media ON media.job_id = jobs.id WHERE jobs.id = ?",
                (args.job_id,),
            ).fetchone()
            video_exists = os.path.isfile(args.media_path)
            if row is None or row[1] != args.media_path or row[2] != "synthetic":
                raise RuntimeError("The synthetic media path or identity changed during repair")
            if row[3] != args.expected_state:
                raise RuntimeError(
                    f"Expected source_state {args.expected_state}, found {row[3]}"
                )
            if (args.expected_state == "local") != video_exists:
                raise RuntimeError("Synthetic video availability did not match its persisted state")
            if row[0] != "completed":
                raise RuntimeError(f"The synthetic job status changed unexpectedly to {row[0]}")
            emit({
                "mode": args.mode,
                "jobId": args.job_id,
                "pathMatches": row[1] == args.media_path,
                "sourceState": row[3],
                "jobStatus": row[0],
                "videoExists": video_exists,
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
