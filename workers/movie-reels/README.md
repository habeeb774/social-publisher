# Movie reels worker

This worker is separate from the Vercel Next.js application. It requires a rights-cleared input video and FFmpeg/FFprobe.

## Local preview

```bash
python workers/movie-reels/render.py /private/input.mp4 /private/review-clips --limit 5
```

## Docker preview

```bash
docker build -t social-publisher-reels workers/movie-reels
docker run --rm -v "$PWD/videos:/videos" --entrypoint python social-publisher-reels /worker/render.py /videos/input.mp4 /videos/previews --limit 5
```

The renderer creates 30-second, 1080x1920 padded previews and labels outputs for manual review. The limit argument controls the number of previews generated in this invocation; it does NOT enforce a daily publishing quota.

## Safety and current limitations

- Only process footage for which you hold the necessary rights.
- No video uploads, database writes, subtitles, review approvals or Meta publishing are implemented by this worker.
- Do not expose worker filesystem or its endpoints publicly.
- Before production, add a durable queue, private object storage, explicit license verification, authenticated job submission, resource limits, and atomic five-per-day publishing limits.
- Each output directory is bound to the source SHA-256 and saved clip plan. Complete H.264 1080x1920 30-second outputs are verified and reused on resume; partial output is never treated as complete. Invalid existing outputs require inspection rather than silent replacement.
- An exclusive `.render.lock` prevents concurrent writers. A process crash can leave this lock; remove only after confirming no process owns the directory. Automated lease recovery remains pending.
- FFmpeg scene detection prefers nearby scene starts where a full 30-second clip still fits. This may omit short gaps; it is not semantic highlight selection. Framing remains non-distorting letterboxing, not subject tracking.
- Local fixture rendering and resume were verified on 2026-10-13; Docker execution and cloud integration are not yet verified.
