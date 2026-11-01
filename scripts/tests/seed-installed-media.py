"""Seed test-owned media and derived content into an isolated smoke library."""

import argparse
import hashlib
import json
import os
import sqlite3
import sys


def emit(payload: dict[str, object]) -> None:
    print(json.dumps(payload, separators=(",", ":")))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=("seed", "verify", "set-path", "verify-state", "index-content"),
        required=True,
    )
    parser.add_argument("--database", required=True)
    parser.add_argument("--media-path")
    parser.add_argument("--job-id", type=int)
    parser.add_argument("--expected-state", choices=("local", "storage_offline"))
    parser.add_argument("--content-json")
    args = parser.parse_args()

    if not os.path.isfile(args.database):
        raise RuntimeError("The isolated installed library database does not exist")
    if args.mode in ("seed", "verify", "set-path") and not args.media_path:
        raise RuntimeError("This mode requires a synthetic media path")
    if args.mode in ("seed", "verify", "set-path") and not os.path.isfile(args.media_path):
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
                "VALUES (?, 'Synthetic installed smoke video', 'Pulsaria CI', 4, ?, 'synthetic', 'local')",
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

        elif args.mode == "index-content":
            if args.job_id is None or not args.content_json:
                raise RuntimeError("Content indexing requires a job ID and processing result")
            with open(args.content_json, encoding="utf-8") as result_file:
                content = json.load(result_file)
            transcript = str(content.get("transcript", "")).strip()
            segments = content.get("segments") or []
            duration = float(content.get("duration") or 0.0)
            analysis = content.get("visualAnalysis") or {}
            artifacts = analysis.get("artifacts") or []
            keyframes = [item for item in artifacts if item.get("kind") == "keyframe"]
            if not transcript or not segments or not keyframes:
                raise RuntimeError("Processed synthetic transcript or keyframe output is incomplete")
            if duration <= 0:
                raise RuntimeError("Processed synthetic transcript has no positive media duration")

            job = connection.execute(
                "SELECT jobs.status FROM jobs JOIN media ON media.job_id = jobs.id "
                "WHERE jobs.id = ? AND jobs.url LIKE 'https://synthetic.invalid/%' "
                "AND media.platform = 'synthetic'",
                (args.job_id,),
            ).fetchone()
            if job is None:
                raise RuntimeError("Content indexing refused a job outside the synthetic fixture")
            connection.execute(
                "UPDATE media SET duration = ? WHERE job_id = ? AND platform = 'synthetic'",
                (duration, args.job_id),
            )

            for index, segment in enumerate(segments):
                segment_text = str(segment.get("text", "")).strip()
                if not segment_text:
                    continue
                connection.execute(
                    "INSERT INTO transcript_segments "
                    "(job_id, segment_index, start_time, end_time, text) VALUES (?, ?, ?, ?, ?)",
                    (
                        args.job_id,
                        index,
                        float(segment.get("start", 0.0)),
                        float(segment.get("end", 0.0)),
                        segment_text,
                    ),
                )

            artifact_ids: dict[str, int] = {}
            for artifact in artifacts:
                artifact_path = str(artifact.get("path", ""))
                if not os.path.isfile(artifact_path):
                    raise RuntimeError("Visual analysis returned a missing synthetic artifact")
                cursor = connection.execute(
                    "INSERT INTO media_artifacts "
                    "(job_id, kind, path, timestamp, label, protected, size_bytes) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        args.job_id,
                        artifact["kind"],
                        artifact_path,
                        artifact.get("timestamp"),
                        artifact.get("label"),
                        int(bool(artifact.get("protected", False))),
                        int(artifact.get("size_bytes", os.path.getsize(artifact_path))),
                    ),
                )
                artifact_ids.setdefault(artifact["kind"], int(cursor.lastrowid))

            first_segment = segments[0]
            last_segment = segments[-1]
            cursor = connection.execute(
                "INSERT INTO search_units "
                "(job_id, representation, ordinal, text, start_time, end_time, "
                "artifact_id, provenance_json, source_hash) "
                "VALUES (?, 'transcript', 0, ?, ?, ?, ?, ?, ?)",
                (
                    args.job_id,
                    transcript,
                    float(first_segment.get("start", 0.0)),
                    float(last_segment.get("end", 0.0)),
                    artifact_ids.get("keyframe") or artifact_ids["poster"],
                    json.dumps({"source": "whisper"}, separators=(",", ":")),
                    hashlib.sha256(transcript.encode("utf-8")).hexdigest(),
                ),
            )
            unit_id = int(cursor.lastrowid)
            connection.execute(
                "INSERT INTO search_units_fts (rowid, text, representation, job_id) "
                "VALUES (?, ?, 'transcript', ?)",
                (unit_id, transcript, args.job_id),
            )
            connection.commit()
            emit(
                {
                    "mode": args.mode,
                    "jobId": args.job_id,
                    "segmentCount": len(segments),
                    "artifactCount": len(artifacts),
                    "keyframeCount": len(keyframes),
                    "searchQuery": content["searchQuery"],
                    "transcriptPersisted": True,
                }
            )
            return 0

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
