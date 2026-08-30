"""
Pulsaria — Worker Daemon Runner
Keeps the worker container online, ready to execute jobs and respond to healthchecks.
"""
import sys
import time

def main():
    print(">>> PULSARIA MULTIMEDIA WORKER DAEMON READY <<<", flush=True)
    while True:
        try:
            time.sleep(3600)
        except (KeyboardInterrupt, SystemExit):
            print("Pulsaria Worker daemon shutting down cleanly.", flush=True)
            break

if __name__ == "__main__":
    main()
