# Movie reels worker
# Runs outside Vercel. Requires FFmpeg and FFprobe.
# No upload, subtitles, or publishing is enabled in this worker.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /worker
COPY plan_clips.py /worker/plan_clips.py
ENTRYPOINT ["python", "/worker/plan_clips.py"]
