import sqlite3
conn = sqlite3.connect('data/library.db')
cursor = conn.cursor()
cursor.execute('UPDATE jobs SET status = "error", error_message = "Restart cleanup" WHERE status IN ("queued", "processing")')
conn.commit()
cursor.execute('SELECT status, count(*) FROM jobs GROUP BY status')
print('Jobs by status:')
for row in cursor.fetchall():
    print(' ', row)
conn.close()
