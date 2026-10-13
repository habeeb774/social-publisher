# Movie reels worker. Runs outside Vercel; requires FFmpeg/FFprobe.
# Build from the repository root so the licensed Tajawal font (OFL) is included:
#   docker build -f workers/movie-reels/Dockerfile -t social-publisher-reels .
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 worker && mkdir -p /work && chown worker /work
WORKDIR /worker
COPY workers/movie-reels/requirements.txt /worker/
RUN pip install --no-cache-dir -r requirements.txt
COPY public/Tajawal-Regular.ttf public/Tajawal-OFL.txt /worker/fonts/
COPY workers/movie-reels/plan_clips.py workers/movie-reels/render.py workers/movie-reels/subtitles.py workers/movie-reels/burn_subtitles.py workers/movie-reels/cloud_worker.py /worker/
USER worker
ENV MOVIE_WORK_DIR=/work MOVIE_FONT=/worker/fonts/Tajawal-Regular.ttf PYTHONUNBUFFERED=1
# Never publishes: leases jobs from MOVIE_API_URL using MOVIE_WORKER_SECRET and uploads to signed private URLs.
ENTRYPOINT ["python", "/worker/cloud_worker.py"]
