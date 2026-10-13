# Movie reels worker
# Runs outside Vercel. Requires FFmpeg and FFprobe.
# No upload, subtitles, or publishing is enabled in this worker.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /worker
COPY requirements.txt /worker/
RUN pip install --no-cache-dir -r requirements.txt
COPY plan_clips.py render.py subtitles.py burn_subtitles.py /worker/
ENTRYPOINT ["python", "/worker/plan_clips.py"]
