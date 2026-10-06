import sqlite3
conn = sqlite3.connect('data/library.db')
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in c.fetchall()]
print('TABLES:', tables)
for t in tables:
    try:
        c.execute(f'SELECT count(*) FROM {t} WHERE job_id=116')
        print(f'{t} count for job 116:', c.fetchone()[0])
    except Exception as e:
        pass
c.execute('PRAGMA table_info(transcript_segments)')
print('SEGMENTS SCHEMA:', [r[1] for r in c.fetchall()])
c.execute('SELECT * FROM transcript_segments WHERE job_id=116')
print('ALL SEGMENTS:', c.fetchall())
c.execute('PRAGMA table_info(media)')
print('MEDIA SCHEMA:', [(r[1], r[2]) for r in c.fetchall()])
c.execute('PRAGMA table_info(jobs)')
print('JOBS SCHEMA:', [(r[1], r[2]) for r in c.fetchall()])
c.execute('PRAGMA table_info(job_activity_events)')
print('JOB_ACTIVITY_SCHEMA:', [(r[1], r[2]) for r in c.fetchall()])
c.execute('SELECT * FROM job_activity_events WHERE job_id=116 ORDER BY id')
print('JOB_ACTIVITY:', c.fetchall())
conn.close()
