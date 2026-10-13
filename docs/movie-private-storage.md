# Private movie storage adapter (not enabled)

The provider uses the official AWS SDK against an HTTPS S3-compatible endpoint. No cloud account, bucket or credentials have been provisioned. The user chose to decide the provider after implementation.

Server-only environment names: `MOVIE_S3_ENDPOINT`, `MOVIE_S3_REGION`, `MOVIE_S3_BUCKET`, `MOVIE_S3_ACCESS_KEY_ID`, `MOVIE_S3_SECRET_ACCESS_KEY`. Store values through the hosting provider's secret settings, never in Git or chat.

Required provider configuration before use:
- A PRIVATE bucket with anonymous/public access blocked, and dedicated credentials restricted to the `movies/` prefix.
- CORS permits PUT from the actual publisher origin only, exposing `ETag`.
- Lifecycle aborts abandoned multipart uploads; they otherwise remain billable.
- HTTPS endpoint supports multipart completion conditional writes (`If-None-Match: *`). Validate compatibility with the selected provider before enabling.

Current code allows MP4/MOV up to 50 GiB, 64 MiB parts (at most 800), up to ten signed part URLs per request, and a 15-minute URL lifetime. Size/ETag/part order are checked before completion; HEAD and 64-byte ISO media signature checked after completion. Worker FFprobe still must validate streams/duration/codecs before processing.

The internal adapter is NOT a public upload endpoint. API integration must persist an owner/movie-bound upload session with expected size/type/storage key/provider upload ID; authorize it before every part-sign/complete/abort action and forbid completion until verified rights. Never trust browser-supplied locators. Ambiguous completion must recover via `verify`, not start another upload blindly. No movie is marked uploaded or queued by this adapter alone.

Pending: database sessions and deadlines/quotas, authenticated API orchestration, browser direct upload/progress/cancellation/resume, worker private downloads and live provider tests. No film file traverses Vercel in the provider design.

Browser transport `src/app/movies/direct-upload.ts` now implements sequential direct PUT chunks, byte progress, fresh part URL on bounded retry, ETag capture, cancellation, cleanup before completion, and explicit unknown-completion session for server reconciliation. It sends no video body to metadata endpoints. Ports must be wired to authenticated session APIs; it is not mounted/enabled in the UI yet. Cross-page resume and live storage/CORS testing remain pending. Signed URLs are never included in client error messages.
