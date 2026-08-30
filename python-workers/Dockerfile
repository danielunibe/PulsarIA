# Pulsaria — Python Worker Dockerfile
FROM python:3.12-slim-bookworm

WORKDIR /app

# Install system dependencies: ffmpeg, ffprobe, curl, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY python-workers/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy worker source code
COPY python-workers /app/python-workers

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/python-workers
ENV PULSAR_DOWNLOAD_DIR=/app/data

WORKDIR /app/python-workers

# Healthcheck
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=5s \
    CMD python -c "import yt_dlp, ffmpeg, faster_whisper, curl_cffi, PIL; print('OK')" || exit 1

# Daemon entrypoint
CMD ["python", "daemon.py"]
