# Movie reels implementation status

Phase 1: schema, private storage, rights verification, and review UI pending. Publishing remains disabled.

2026-10-13 audit: `/movies` is a placeholder; the SQL foundation is not proof of a migrated database. Worker rendering is offline-only, with no subtitles, cloud upload, queue or Meta dispatch yet.

Added `src/services/movie-reels/policy.ts` and four tests covering verified licensing/platform scope/expiry, mandatory clip and subtitle approval, exact 30-second duration, explicit authorized page selection, ordered part scheduling, per-page Riyadh-day quotas and duplicate rejection. This is a pure planner, NOT atomic database reservation or a live publisher. The persistence layer must lock/reserve slots transactionally and recheck rights at dispatch time.

Remaining: private direct upload/storage credentials, database migration on an isolated test branch, movie/job/review APIs and UI, durable leased worker, scene-aware cutting and transcription, editable subtitles/re-render, transactional schedule reservations, official Meta Reels dispatch and outcome reconciliation, end-to-end tests and explicit final publishing authorization. Local environment has FFmpeg but no Docker executable; no working database connection or private movie-storage configuration was verified. No production feature flags were enabled.

Defaults: 30 seconds per clip, 5 reels/day, automatic subtitles and part numbers, mandatory review, explicit Facebook page selection and verified rights.

Worker progress 2026-10-13: scene-aware exact-duration planning, source-bound manifest, exclusive directory lock, validated MP4 outputs, atomic partial-to-final rename and reuse of completed outputs. Fourteen Python tests pass. A generated 30-second fixture was rendered with real FFmpeg and resumed successfully; ffprobe confirmed H.264, 1080x1920, 30 seconds. Transcription/subtitles, leased cloud jobs and Docker runtime validation remain pending.

Subtitle progress: local faster-whisper adapter with offline model requirement, validated editable cues, per-clip offset/clamping and SRT export are connected to render output. Eighteen Python tests pass; timed caption transforms tested, real model inference NOT yet verified. Runtime reports missing transcription explicitly. Subtitle burn-in/re-render and Arabic UI review remain incomplete.

Burn-in progress: `burn_subtitles.py` accepts validated edited cues and Arabic font, renders captioned/revision-addressed MP4 with part label, preserves original outputs, and marks every edited output for another review. Twenty worker tests pass; real FFmpeg subtitle rendering verified with a synthetic fixture. Human UI edits and worker cloud orchestration remain pending; no publishing enabled.

Database integration progress: five typed Drizzle movie tables, additive `drizzle/0019_movie_reels.sql` based on the phase1 foundation, rights/evidence fields, caption revisions, approval history, job/publication leases and unique clip publication identity. `/api/movies` lists owner-scoped metadata (administrators can list all); private storage/evidence excluded. Disabled by default. Migration has NOT been applied or tested against a live/disposable database. Slot transaction, write APIs, UI and worker persistence remain pending. Drizzle config includes the movie schema.

Movie registration API: metadata-only POST, authenticated content.write + same-origin guard, mandatory active authorized Facebook page, persisted database user ownership (env-admin bootstrap cannot own an asset), explicit licensing declaration/evidence and expiry validation. Extra approval/owner/storage fields are rejected. Always creates pending-rights draft, never queues or publishes. Nine movie tests pass. No live database execution verified; requires migration and feature flag before use. Arabic registration UI, upload session/confirmation, rights verification actions and job dispatch still pending.

Arabic `/movies` registration/list UI now connected to API with licensed-source declarations, authorized Facebook page options, expiry date interpreted at Riyadh end-of-day, loading/error states and single-flight saves. Disabled/read-only states tested with server rendering; upload is explicitly not offered while infrastructure remains pending. Existing React guidance applied for asynchronous loading/race protection. Live DB-backed browser flow remains unverified, and clip review/upload/cloud/publish integration are not complete.

Private storage provider layer added: official AWS SDK multipart initiate/sign/complete/verify/abort, private source key generation, 50GiB validation, bounded parts and URLs, stored ETag/size checks and ISO video header verification. No real bucket/credentials or provider connection established. Upload API ownership sessions and browser orchestration remain pending. User explicitly deferred provider/server selection until code completion.

Browser direct-upload transport implemented and five tests pass (metadata-only API boundary, bounded same-session retries, safe unknown-completion handling, pre-initiation cancellation and invalid ETag cleanup). It is NOT enabled in the movie UI; persistent sessions, authenticated orchestration, progress UI mounting, live storage test and cross-page resume still pending.

Human rights review API added at `/api/movies/[id]/rights`: current reviewer role + page scope checked in the atomic update, expected rights revision prevents stale decisions, verification requires evidence/platform/excerpt scope/unexpired license/active Facebook page. Decision and history saved in one CTE; reject/revoke cancels scheduled publications and clears approved/scheduled clips only. `0020_movie_rights_reviews.sql` is not applied. SQL-shape/input tests pass; live transaction/concurrency and UI review remain unverified. Dispatch must recheck rights and serialize its final send gate with revocation; that layer is still pending.

Caption resume audit fixed a data-loss bug: per-clip reviewer edits are no longer overwritten from transcript on resume. Derived SRT comes from validated edited JSON; source/interval mismatches refused. Standalone transcript CLI now writes the source hash expected by render. Twenty-three Python worker tests pass. This does not complete UI review/cloud worker integration or enable publishing.

## 2026-10-13 — End-to-end pipeline wired (code complete, infrastructure pending)

Implemented: persisted multipart upload sessions (`/api/movies/[id]/upload`), detail/review API with signed private previews, revision-bound caption/title edits that queue burn-in re-renders, individual and bulk approve/reject/exclude with audit, per-page advisory-locked scheduling (5/Riyadh day, ordered parts), authenticated worker API (`/api/movies/worker`, bearer `MOVIE_WORKER_SECRET`), leased Docker `cloud_worker.py`, and a cron publisher that rechecks rights/review/page/order/quota at lease time and stores reel id + permalink. Graph rejections retry with backoff (max 3); ambiguous sends become `outcome_unknown` and require a human "checked the Page" action. Arabic `/movies` dashboard covers upload progress, processing status, previews, caption editing, rights review, bulk approval, page selection, schedule and publication log.

Tests: 44 movie TS tests + 27 Python worker tests (real FFmpeg render/burn-in/resume with fake API). `npm run build` passes.

NOT verified (needs your infrastructure): migrations 0019–0021 on a live/disposable Neon branch, a real private S3-compatible bucket (incl. CORS exposing `ETag`), the Docker worker on a server, and a real Meta Reels publish. `MOVIE_REELS_PUBLISHING_ENABLED` stays unset until final approval.

Required environment (Vercel): `MOVIE_REELS_ENABLED=true`, `MOVIE_S3_ENDPOINT`, `MOVIE_S3_REGION`, `MOVIE_S3_BUCKET`, `MOVIE_S3_ACCESS_KEY_ID`, `MOVIE_S3_SECRET_ACCESS_KEY`, `MOVIE_WORKER_SECRET` (≥32 chars); later `MOVIE_REELS_PUBLISHING_ENABLED=true`. Worker: `MOVIE_API_URL`, the same `MOVIE_WORKER_SECRET`, optional `MOVIE_WHISPER_MODEL_DIR`.
