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
