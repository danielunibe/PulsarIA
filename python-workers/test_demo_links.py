import subprocess
import json
import sys
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

urls = [
    (201, 'https://www.tiktok.com/@albert86383/video/7661746643284413704'),
    (202, 'https://www.tiktok.com/@dreamyxscape/video/7655530103786474766'),
    (203, 'https://www.tiktok.com/@dreamyxscape/video/7677416688568093965'),
    (204, 'https://www.tiktok.com/@dreamyxscape/video/7664446578878369038'),
    (205, 'https://www.tiktok.com/@sanjariuss/video/7440985300647611666'),
    (206, 'https://www.tiktok.com/@jamestralie/video/7544037721120017694')
]

failures = []

for job_id, url in urls:
    print(f"\n==========================================")
    print(f"TESTING JOB {job_id}: {url}")
    print(f"==========================================")
    proc = subprocess.run(
        [sys.executable, 'main.py', '--job_id', str(job_id), '--url', url],
        cwd=WORKER_DIR,
        capture_output=True,
        text=True,
    )
    lines = [line.strip() for line in proc.stdout.strip().split('\n') if line.strip().startswith('{')]
    
    for l in lines:
        try:
            ev = json.loads(l)
            print(f"  -> Event: {ev.get('event', ev.get('step'))} | Progress: {ev.get('progress')}%")
        except Exception:
            pass
            
    if lines:
        last = json.loads(lines[-1])
        meta = last.get('metadata', {})
        print(f"RESULT: {last.get('event')} | Title: '{meta.get('title', 'N/A')}' | Duration: {meta.get('duration')}s | Code: {proc.returncode}")
        if proc.returncode != 0 or last.get('event') != 'completed':
            failures.append(job_id)
    else:
        print(f"RESULT ERROR: No events. STDERR: {proc.stderr[:300]}")
        failures.append(job_id)

print(f"\nSUMMARY: passed={len(urls) - len(failures)} failed={len(failures)}")
if failures:
    print(f"FAILED JOBS: {', '.join(str(job_id) for job_id in failures)}")
    raise SystemExit(1)
