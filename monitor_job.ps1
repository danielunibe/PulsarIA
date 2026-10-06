for ($i = 1; $i -le 20; $i++) {
    $ts = Get-Date -Format "HH:mm:ss"
    $pycode = "import sqlite3; conn = sqlite3.connect('data/library.db'); c = conn.cursor(); c.execute('SELECT status, progress, error_message FROM jobs WHERE id=116'); r = c.fetchone(); print(f'[{0}] Job 116: status={r[0]} progress={r[1]} error={r[2][:50] if r[2] else None}'.format('$ts'))"
    python -c $pycode
    Start-Sleep -Seconds 15
}
