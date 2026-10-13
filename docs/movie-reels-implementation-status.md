# Movie reels implementation status

Phase 1: schema, private storage, rights verification, and review UI pending. Publishing remains disabled.

2026-10-13 audit: `/movies` is a placeholder; the SQL foundation is not proof of a migrated database. Worker rendering is offline-only, with no subtitles, cloud upload, queue or Meta dispatch yet.

Added `src/services/movie-reels/policy.ts` and four tests covering verified licensing/platform scope/expiry, mandatory clip and subtitle approval, exact 30-second duration, explicit authorized page selection, ordered part scheduling, per-page Riyadh-day quotas and duplicate rejection. This is a pure planner, NOT atomic database reservation or a live publisher. The persistence layer must lock/reserve slots transactionally and recheck rights at dispatch time.

Remaining: private direct upload/storage credentials, database migration on an isolated test branch, movie/job/review APIs and UI, durable leased worker, scene-aware cutting and transcription, editable subtitles/re-render, transactional schedule reservations, official Meta Reels dispatch and outcome reconciliation, end-to-end tests and explicit final publishing authorization. Local environment has FFmpeg but no Docker executable; no working database connection or private movie-storage configuration was verified. No production feature flags were enabled.

Defaults: 30 seconds per clip, 5 reels/day, automatic subtitles and part numbers, mandatory review, explicit Facebook page selection and verified rights.

Worker progress 2026-10-13: scene-aware exact-duration planning, source-bound manifest, exclusive directory lock, validated MP4 outputs, atomic partial-to-final rename and reuse of completed outputs. Fourteen Python tests pass. A generated 30-second fixture was rendered with real FFmpeg and resumed successfully; ffprobe confirmed H.264, 1080x1920, 30 seconds. Transcription/subtitles, leased cloud jobs and Docker runtime validation remain pending.
