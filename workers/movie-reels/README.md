# Movie reels worker

This worker is separate from the Vercel Next.js application. It requires a rights-cleared input video and FFmpeg/FFprobe.

## Cloud worker (production path)

`cloud_worker.py` leases jobs from the app, never publishes and never approves:

```bash
docker build -f workers/movie-reels/Dockerfile -t social-publisher-reels .
docker run -d --restart unless-stopped --memory 4g --cpus 2   -e MOVIE_API_URL=https://sp.leanpix.site -e MOVIE_WORKER_SECRET=...   -v reels-work:/work [-v /models/whisper-small:/models/whisper:ro -e MOVIE_WHISPER_MODEL_DIR=/models/whisper]   social-publisher-reels
```

Flow: `lease` → download source via signed URL (12h) → scene-aware 30 s 1080x1920 render → local transcription (if model mounted) → burn Arabic captions + part label → PUT `base` and `r1` to server-derived signed keys → `report_clips` in batches of 10 → `complete`. A heartbeat renews the 20-minute lease; an expired lease is re-leased (max 5 attempts) and resumes from the source-bound local cache and the server's `existingParts`, so reviewed clips are never overwritten. Caption edits in the dashboard create `rerender` jobs that burn the new revision `rN` from the stored `base` clip.

Requires the `MOVIE_WORKER_SECRET` (≥32 chars) to match the Vercel environment variable. Disk needs roughly 2× the largest source size.

## Environment

| Var | Default | Notes |
|---|---|---|
| `MOVIE_API_URL` | required | https; http only for localhost or with `MOVIE_ALLOW_INSECURE_API=1` (dev) |
| `MOVIE_WORKER_SECRET` | required | ≥32 chars, same as app |
| `MOVIE_WORK_DIR` | `/work` | ~2× largest source |
| `MOVIE_FONT` | `/worker/fonts/Tajawal-Regular.ttf` | |
| `MOVIE_WHISPER_MODEL_DIR` | unset | offline faster-whisper model; see `download_model.py` (small/medium) |
| `MOVIE_POLL_SECONDS` | `30` | |

Local stack: `docker-compose.movies.yml` (profile `worker`) and `docs/movie-reels-local-dev.md`.

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
- The worker never approves clips or calls Meta; publishing happens only in the app after human review.
- Do not expose worker filesystem or its endpoints publicly.
- Before production, add a durable queue, private object storage, explicit license verification, authenticated job submission, resource limits, and atomic five-per-day publishing limits.
- Each output directory is bound to the source SHA-256 and saved clip plan. Complete H.264 1080x1920 30-second outputs are verified and reused on resume; partial output is never treated as complete. Invalid existing outputs require inspection rather than silent replacement.
- An exclusive `.render.lock` prevents concurrent writers. A process crash can leave this lock; remove only after confirming no process owns the directory. Automated lease recovery remains pending.
- FFmpeg scene detection prefers nearby scene starts where a full 30-second clip still fits. This may omit short gaps; it is not semantic highlight selection. Framing remains non-distorting letterboxing, not subject tracking.
- Local fixture rendering and resume were verified on 2026-10-13; Docker execution and cloud integration are not yet verified.

## Local timed subtitles

Install `requirements.txt` in the worker environment and mount a pre-provisioned faster-whisper model directory. No audio is uploaded to a transcription API and model downloads are disabled in runtime.

```bash
python render.py /private/input.mp4 /private/review-clips --limit 5 --model-dir /models/whisper-small
```

This saves a source-bound `transcript.json`, per-part editable `.captions.json` and UTF-8 `.srt` with times clamped to each 30-second clip. Without a model, output explicitly reports `transcription_required`. Captions remain review-required; they are NOT yet burned into MP4. Caption edit UI, reviewed re-render, actual model inference verification and cloud integration remain pending. Silence may produce zero cues and still requires human review.

## Burn reviewed captions into a new preview revision

```bash
python burn_subtitles.py /private/review-clips/part-001.mp4 /private/review-clips/part-001.captions.json /private/captioned --part 1 --font /fonts/Tajawal-Regular.ttf
```

This creates a new revision-addressed MP4 with Arabic subtitles and part number; it never approves or publishes. Every changed caption/timing/input/font produces a new revision requiring review. Mount the licensed Tajawal font from the application's `public` directory and preserve its OFL notice. The current web UI is not wired to this command yet.

Editable `.captions.json` files are authoritative on render resume; transcription cannot overwrite human edits. The derived SRT is regenerated from validated edited cues. New caption files include source hash and start interval, and mismatched bindings are refused. Legacy caption files remain accepted only inside their already source-bound output directory. Edits still require a new burn-in revision and human approval; JSON `review_required` is not publishing authorization.
