# YouTube movie Shorts integration

Code is opt-in. No existing movie is approved, licensed or scheduled automatically, and no Google credentials are committed.

## Setup after code verification

1. Create/select a Google Cloud project. Enable **YouTube Data API v3**. Configure the OAuth consent screen and add the actual channel owner as a test user if the app is in testing.
2. Create an OAuth **Web application** client. Add this exact authorized redirect URI:
   `https://sp.leanpix.site/api/youtube/callback`
3. Store server-only variables using the hosting provider's secret controls:
   - `YOUTUBE_CLIENT_ID`
   - `YOUTUBE_CLIENT_SECRET` (secret)
   - `YOUTUBE_REDIRECT_URI=https://sp.leanpix.site/api/youtube/callback`
   - Existing `AUTH_SECRET` must remain stable; refresh tokens are AES-256-GCM encrypted with the existing token vault.
4. Test `drizzle/0024_movie_youtube.sql` on an isolated database/branch first, then apply it through the repository's SQL migration workflow as a single transaction. This standalone migration is NOT automatically applied by deploying Next.js. Do not run `db:generate` against stale snapshots or run production schema pushes.
   The bounded runner `scripts/apply-youtube-migration.mjs` accepts a process-only direct `YOUTUBE_MIGRATION_DATABASE_URL` and requires `YOUTUBE_EXPECTED_DATABASE_HOST`. It refuses pooled/wrong hosts and existing/partial tables, applies only this migration atomically, and prints only the migration checksum and row counts. Never commit either connection string or OAuth JSON downloads.
5. Set `MOVIE_YOUTUBE_ENABLED=true`, redeploy, and click **ربط قناة YouTube بحساب Google** from `/movies` while signed into a registered database admin account. The owner completes Google consent. This is channel access, not app login.
6. Confirm the intended channel title. One channel may have only one connecting owner to keep quotas and duplicate protection global. Another admin cannot silently overwrite its credentials.
7. Document original rights, explicitly review the **YouTube excerpt license**, and approve each final clip/subtitle revision. Facebook permission is NOT sufficient.
8. Select the channel, Riyadh start time, visibility, child-directed and synthetic-media declarations. **Private** is the safe default; select **Public** only when that is your intended audience. Reservation does not enable dispatch.
9. Only after the owner authorizes automatic YouTube uploads, set `MOVIE_YOUTUBE_PUBLISHING_ENABLED=true` and redeploy. The existing authenticated `/api/cron/publish` worker dispatches up to one due YouTube upload per tick. No extra cron is created by this change. Its function duration is 300 seconds; confirm Fluid Compute/settings allow that before activation.
10. First real verification should use an owned disposable clip with **private** visibility. Google credentials and channel consent are required for a real upload test; the automated tests mock Google and use isolated Postgres.

Default for both YouTube flags is off. Disable the publishing flag and redeploy to stop new uploads without affecting Facebook. Disabling it cannot undo an upload already in flight.

## Behavior and safety

- YouTube has separate tables, channel selection, reservations, quota and state. Facebook clip/publication state is unchanged; an already Facebook-published clip can be scheduled on YouTube if its same approved revision and rights remain valid.
- Five uploads per Riyadh day per channel; no duplicate `(clip,channel)` uploads. Google quotas still apply separately. Shorts classification is decided by YouTube, not a dedicated Shorts API flag.
- OAuth uses PKCE, a secure HttpOnly SameSite cookie and a one-use database state bound to the logged-in user. Requested scopes: `youtube.upload`, `youtube.readonly`. No tokens are exposed by list/detail APIs.
- Rights decisions have a separate immutable history. Editing/revoking original rights or editing/rejecting a clip cancels queued YouTube slots through database triggers. Leases and the pre-media check revalidate permission/revision.
- A successful upload is `processing`, not `published`. Google processing confirmation and actual privacy determine `published`, `private`, or `unlisted`.
- Media PUT is never blindly repeated. An ambiguous response, timeout or expired uploading lease becomes `outcome_unknown`; it blocks later parts until a human checks Studio. No automatic retry and no fake success. Reconciliation/retry of failed or uncertain uploads is intentionally not offered in this initial UI: inspect Studio before making any new upload decision.
- Revoking rights stops pending uploads; it does not remove public videos already sent. Rights can change while an upstream API call is in flight; manually inspect that video if this occurs.
- Disconnect disables the channel, cancels queued slots, revokes the Google grant, and clears the local refresh token on successful revocation. Existing YouTube videos are preserved. If revocation fails, the UI reports that Google access must be revoked manually.
- The existing movie deletion guard refuses deleting files for an uploading, processing, uncertain, or remotely uploaded YouTube video. It never calls YouTube deletion APIs.

## Verification

```powershell
npx tsx --test tests/youtube.test.ts
npx tsc --noEmit --incremental false
npx next build --webpack
```

The tests cover PKCE/consent, hostile upload URLs, private/public status, ambiguous media outcomes, separate rights, real SQL reservation rollback, quota, duplicate rejection, review withdrawal, deletion guards and lease expiry. Test data never touches the production database or YouTube.

Sources: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [YouTube resumable uploads](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol), [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert).

## أزرار النشر

في أعلى `/movies` أزرار مستقلة لتشغيل وإيقاف ريلز الأفلام على Facebook وYouTube، للمدير فقط. تستخدم `PUT /api/movies/publishing` مع حماية المصدر والصلاحيات وتسجيل الإجراء.
تُحفظ الحالة في جدول `settings` القائم، بالمفتاحين `movie_facebook_publishing_enabled` و`movie_youtube_publishing_enabled`. أول استخدام يرث أعلام النشر الحالية؛ بعده تكون الأزرار مرجع التشغيل، مع بقاء أعلام تمكين التكامل وبيانات Google شرطًا لازمًا. لا يلزم ترحيل جديد.
الإيقاف يوقف إرسال المقاطع الجديدة ولا يحذف المنشور أو الجدولة أو الترخيص، ولا يستطيع إلغاء رفع بدأ بالفعل. عند التشغيل تعود المواعيد المستحقة وفق قيود الترتيب والحصة والحقوق. لا تؤثر الأزرار على الناشر العام أو ردود التعليقات.
