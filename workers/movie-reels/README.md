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
- Existing clips are not overwritten; a failed render may leave a partial output file, which must be removed after inspection before retrying.
- Framing uses letterboxing; automatic scene selection and smart reframing are not yet implemented.
