# Movie reels worker

This worker is separate from the Vercel Next.js application. It requires a rights-cleared input video and FFmpeg/FFprobe.

## Cloud worker (production path)

`cloud_worker.py` leases jobs from the app, never publishes and never approves:

```bash
docker build -f workers/movie-reels/Dockerfile -t social-publisher-reels .
docker run -d --restart unless-stopped --memory 4g --cpus 2   -e MOVIE_API_URL=https://sp.leanpix.site -e MOVIE_WORKER_SECRET=...   -v reels-work:/work [-v /models/whisper-small:/models/whisper:ro -e MOVIE_WHISPER_MODEL_DIR=/models/whisper]   social-publisher-reels
```

Flow: `lease` → download source via signed URL (12h) → rank highlights using the private vision model → 30 s 1080x1920 render → local transcription (if model mounted) → burn Arabic captions + part label → PUT `base` and `r1` to server-derived signed keys → `report_clips` in batches of 10 → `complete`. A heartbeat renews the 20-minute lease; an expired lease is re-leased (max 5 attempts) and resumes from the source-bound local cache and the server's `existingParts`, so reviewed clips are never overwritten. Caption edits in the dashboard create `rerender` jobs that burn the new revision `rN` from the stored `base` clip.

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
| `MOVIE_CLIP_SELECTION` | `highlights` | New plans use visual highlight selection; `sequential` explicitly enables legacy splitting. Existing saved plans are never rewritten. |
| `MOVIE_HIGHLIGHT_MODEL` | required for highlights | Pre-provisioned Ollama vision model; no automatic downloads. |
| `MOVIE_HIGHLIGHT_URL` | `http://localhost:11434` | Trusted private Ollama endpoint. Windows setup uses `http://vision:11434` on the `movie-highlights_default` Docker network. Other remote hosts require HTTPS. |
| `MOVIE_HIGHLIGHT_MAX_CLIPS` | `20` | Maximum selected clips per movie, not publishing quota. |
| `MOVIE_HIGHLIGHT_MIN_SCORE` | `6` | Minimum estimated visual excitement score (0–10). |

Highlight selection scans the whole movie in overlapping 30-second windows every 15 seconds, including its tail, using five chronological frames per window. A configured local vision model scores action, danger, confrontation and suspense; low scores and overlapping intervals are excluded. Selected clips retain chronological order and remain review-required. Ranking caches are source-bound and resume after interruption. Missing configuration, invalid model responses and no confident highlights fail visibly; they never silently fall back to sequential splitting. Sampling can miss brief events and cannot understand audio, dialogue or full narrative context. This is estimated visual ranking, not guaranteed cinematic understanding. Evaluate ranking quality on rights-cleared films before approving clips; see the runtime verification below for the tests already completed. Installing the repository alone does not provision the model; run the setup script on each worker host. The worker sends sampled frames only to the explicitly configured analyzer; do not use an untrusted/public service.

Classification schema v2 also requires an event category. Quiet scenes, credits, abstract test patterns and uncertain classifications are assigned zero regardless of their raw score. Color or motion alone must not qualify as action. Five images require an 8192-token context for the configured Qwen model; 4096 tokens was rejected by the real runtime test.

Verified locally on 2026-10-13: Ollama model download and vision capability, private Docker-network access, actual inference with `qwen2.5vl:3b`, rendering a complete 30-second 1080x1920 clip, and cache/manifest resume. The synthetic negative fixture was correctly classified `test_pattern` with score 0; the smoke command lowers the threshold to 0 only inside its own isolated process so it can test rendering that fixture. Final smoke duration was 158.3 seconds on a GTX 1650 with CPU/GPU offload. All 45 worker tests passed. Long-film analysis can take many hours on this hardware; cinematic ranking quality on real licensed films still needs human evaluation. The production worker was switched to highlight mode and its app authentication and model readiness verified without publishing any test content. Docker and this PC must remain running. This verification does not claim end-to-end publication or real-film ranking validation.

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
- Legacy `sequential` mode uses FFmpeg scene boundaries, not semantic selection. Highlight mode uses sampled visual model ranking as described above. Framing remains non-distorting letterboxing, not subject tracking.
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


## Windows production worker setup (private R2)

### Model response recovery

Empty, malformed, incomplete or invalid-schema model responses are retried up to three times per window. After a constrained-schema generation failure, retries use plain JSON mode while keeping the same strict rating/category validation. Network errors and HTTP 408/429/5xx are also retryable; redirects, oversized replies and other HTTP 4xx fail closed. Exhausted temporary failures are RuntimeErrors, so the worker reports a retryable job failure and preserves its source-bound ratings and work files instead of deleting them. No invalid rating is cached and no scene is silently skipped. Already permanently failed jobs need an explicit requeue; this change does not resurrect caches previously deleted by the old permanent-failure path. Regression suite: 48 tests passed, including malformed-response recovery and work-directory preservation. A narrow deployment hotfix can be built with `Dockerfile.retry-fix` to avoid including unrelated local worker edits.

### Local highlight analyzer

Run `windows/setup-highlights.ps1` to create a localhost-only Ollama Docker service and download `qwen2.5vl:3b` (approximately 3.2 GB). Persistent model files live in the `movie-highlights_vision-models` Docker volume; do not delete this volume unless deliberately uninstalling the model. The compose setup requests an NVIDIA GPU supported by Docker Desktop/WSL2; remove `gpus: all` for CPU-only hosts (much slower). It is independent of the application deployment and never publishes. Configure the highlight variables shown in `worker.env.example`; preserve the existing secret and API URL. Let active jobs finish before rebuilding/restarting the worker. Previously saved clip plans remain unchanged; highlight selection applies to new movie plans. Run `/worker/verify_highlights.py` inside a one-off worker container with the model settings; it exercises real inference, rendering and resume without accessing the application or publishing. Reference: https://ollama.com/library/qwen2.5vl

The service disables cloud inference and Vulkan probing, uses CUDA GPU 0, and waits for a successful health check before downloading the model. The Windows worker launcher joins the private model network when its URL is `http://vision:11434`; no new firewall rule or public endpoint is needed. Example smoke test (no uploads, no application mutations):

```powershell
docker run --rm --network movie-highlights_default --env-file workers/movie-reels/windows/worker.env --entrypoint python social-publisher-reels /worker/verify_highlights.py
```

The container polls `https://sp.leanpix.site` over outbound HTTPS. The worker needs **only**
`MOVIE_API_URL` and a shared `MOVIE_WORKER_SECRET`; R2 access credentials belong to
the Vercel application and should **not** be added to `worker.env`.

From PowerShell, in `workers/movie-reels/windows`:

```powershell
.\setup-worker-secret.ps1 -CopyToClipboard
```

This creates the locally gitignored `worker.env` using a cryptographically random
64-character hexadecimal secret and puts the secret temporarily on your clipboard.
Set that **same** value in Vercel's Production environment as `MOVIE_WORKER_SECRET`.
Clear the clipboard after use and redeploy to apply new environment variables.
Do not paste the secret into chat or GitHub.

Keep `MOVIE_REELS_PUBLISHING_ENABLED=false` until end-to-end tests and explicit
approval. Vercel environment changes cannot be made from GitHub alone.

When Vercel settings are saved, the worker can be started from the same folder:

```powershell
.\start-worker.ps1 -WorkDir D:\movie-work -SourceDir D:\Movies
.\worker-status.ps1
```

If `worker.env` already exists, the setup script refuses to overwrite it to prevent
accidental divergence between the server and worker credentials. For translation,
mount a downloaded faster-whisper model using the `-ModelDir` argument.
