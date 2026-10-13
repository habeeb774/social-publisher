# Movie Reels Publisher — implementation plan

Status: approved specification; NOT live or enabled.

## Defaults
- Clip duration: 30 seconds.
- Daily limit: 5 reels per selected Facebook page, timezone Asia/Riyadh.
- Automatic subtitles: on (reviewable, never presumed accurate).
- Part numbering: on.
- Human review: mandatory for every clip.
- Publishing: disabled until a page is explicitly selected, rights verified, and each clip approved.
- No full movies or unlicensed footage are published.

## Architecture
1. Next.js UI: private movie upload, title/rights evidence, destination page, job progress, clip preview, editing, approval, scheduling.
2. API: authenticated upload session with direct-to-object-storage signed URL; never stream a feature-length film through Vercel. Validate MIME, file signatures, size, ownership and quotas. Keep originals private.
3. Storage: private S3-compatible buckets for source, processing intermediates, and approved reel outputs. Short-lived signed access URLs.
4. Database: movie_assets, movie_jobs, movie_clips, movie_approvals, movie_publications. Tenant/page access checks, unique clip indexes, and audit trail.
5. Separate worker: container running FFmpeg/ffprobe, scene detection and 30s clip extraction, 9:16 reframing with safe areas, audio loudness normalization, speech-to-text and burned-in subtitles; mark subtitle quality for human review. CPU/GPU workload runs outside Vercel.
6. Queue: managed durable queue, idempotent job identifiers, retry with exponential backoff, dead-letter queue, bounded concurrency and resource limits.
7. Scheduler: schedule at most five approved clips per Riyadh calendar day per page, atomically reserve slots; no duplicate clips or conflicting posts.
8. Meta: upload reels through officially supported Page video/Reels publishing flow and permitted page token. Store remote ID and status; handle API errors without blind re-upload after ambiguous outcomes.
9. Observability: structured job status, processing errors, publish attempts, per-clip history and alerts.

## Workflow / states
movie: uploaded -> rights_pending -> rights_verified -> queued -> processing -> review_required -> ready
clip: extracted -> subtitle_review -> pending_approval -> approved -> scheduled -> publishing -> published | failed
Any rights revocation or approval rejection blocks scheduling and publication.

## Rights gate
Record declarant, ownership/license basis, allowed platforms, allowed excerpts, territory, license expiry, evidence reference and verification timestamp. Self-declaration alone must not silently grant publishing rights. Reject unclear rights; allow human verification.

## Safe rollout
Phase 1: database migration + feature-flagged upload/rights UI + private storage.
Phase 2: separate worker, queue, thumbnails, 30-second clipping, subtitles and previews.
Phase 3: human review, page selection, scheduling and official Meta integration in test mode.
Phase 4: explicit opt-in production enablement, five-per-day limit, logging and monitoring.

Feature flags (all default false):
MOVIE_REELS_ENABLED, MOVIE_REELS_PROCESSING_ENABLED, MOVIE_REELS_PUBLISHING_ENABLED (stays false until tests pass, rights are verified and the owner explicitly approves).

## Configuration (provider-agnostic)
- Storage: `MOVIE_STORAGE_DRIVER=s3|local`. `s3` works with any S3-compatible provider (R2, AWS S3, B2, Wasabi, MinIO) via `MOVIE_S3_ENDPOINT`, `MOVIE_S3_REGION`, `MOVIE_S3_BUCKET`, `MOVIE_S3_ACCESS_KEY_ID`, `MOVIE_S3_SECRET_ACCESS_KEY`, `MOVIE_S3_FORCE_PATH_STYLE`. `local` (dev only) uses `MOVIE_LOCAL_STORAGE_DIR` + `MOVIE_LOCAL_STORAGE_SECRET`.
- Publishing: `MOVIE_PUBLISH_DRIVER=meta|mock` (`mock` never calls Meta).
- Worker: `MOVIE_WORKER_SECRET` (≥32 chars, shared); worker env `MOVIE_API_URL`, `MOVIE_WORK_DIR`, `MOVIE_FONT`, `MOVIE_WHISPER_MODEL_DIR`, `MOVIE_POLL_SECONDS`, `MOVIE_ALLOW_INSECURE_API=1` (dev only).
- Local runbook: `docs/movie-reels-local-dev.md`; stack: `docker-compose.movies.yml`.

No scheduler, Facebook page, or existing content workflow is changed by this document.

## Publish driver (pluggable target)
`MOVIE_PUBLISH_DRIVER` = `meta` (default) | `mock` — see `src/services/movie-reels/publish-driver.ts`.
- `meta`: Page Reels upload via `publishGraphReel` with a 120s upload timeout (other callers keep 30s).
- `mock`: no network; returns a fake numeric reel id and `https://example.invalid/reel/<id>`. Refused when `NODE_ENV=production`.
- Both drivers still require `MOVIE_REELS_ENABLED=true` AND `MOVIE_REELS_PUBLISHING_ENABLED=true`; leases still recheck rights, review, order and quota.
- Dev only: `POST /api/movies/dispatch` (needs `settings.manage`) runs one publish tick; it returns 404 unless the driver is `mock` and this is not production.
