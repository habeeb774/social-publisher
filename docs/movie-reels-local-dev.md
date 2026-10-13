# Movie reels — local development runbook / دليل التشغيل المحلي

Provider-agnostic: storage and publishing are selected by environment variables only. Locally we use MinIO (S3-compatible) and the **mock** publisher; nothing is posted to Meta.
النظام لا يعتمد على مزود محدد؛ محليًا نستخدم MinIO وناشرًا وهميًا (mock) فلا يُنشر شيء على Meta.

## 0. Prerequisites / المتطلبات
Node 20+, Docker Desktop, Python 3.12 (for worker tests), `psql` (optional).

## 1. Environment / المتغيرات
Copy the movie section of `.env.example` into `.env.local`, then:
انسخ قسم الأفلام من `.env.example` إلى `.env.local` ثم:

```bash
openssl rand -hex 32   # -> MOVIE_WORKER_SECRET (same value for app and worker / نفس القيمة للتطبيق والعامل)
```
Set `MOVIE_REELS_ENABLED=true`, `MOVIE_PUBLISH_DRIVER=mock`. **Keep `MOVIE_REELS_PUBLISHING_ENABLED=false`.**
For a storage-free run use `MOVIE_STORAGE_DRIVER=local` + `MOVIE_LOCAL_STORAGE_DIR` + `MOVIE_LOCAL_STORAGE_SECRET` (≥32 chars, required: the driver refuses to start without it).

| Variable | Dev value | Production |
|---|---|---|
| MOVIE_STORAGE_DRIVER | `s3` (MinIO) or `local` | `s3` |
| MOVIE_S3_ENDPOINT / REGION / BUCKET | `http://localhost:9000` / `us-east-1` / `movie-reels` | provider endpoint (R2: `https://<acct>.r2.cloudflarestorage.com`, region `auto`) |
| MOVIE_S3_ACCESS_KEY_ID / SECRET_ACCESS_KEY | MinIO dev creds | scoped bucket key |
| MOVIE_S3_FORCE_PATH_STYLE | `true` | `true` for MinIO/R2, `false` for AWS |
| MOVIE_PUBLISH_DRIVER | `mock` | `meta` |
| MOVIE_REELS_PUBLISHING_ENABLED | `false` | `true` only after final approval |
| Worker: MOVIE_API_URL, MOVIE_WORKER_SECRET, MOVIE_WORK_DIR, MOVIE_FONT, MOVIE_WHISPER_MODEL_DIR, MOVIE_POLL_SECONDS, MOVIE_ALLOW_INSECURE_API | see compose | https URL, no insecure flag |

## 2. Database migrations / ترحيلات قاعدة البيانات
Apply `drizzle/0019_movie_reels.sql`, `0020_movie_rights_reviews.sql`, `0021_movie_pipeline.sql` **in order**, to a Neon branch (never prod first) or local Postgres:
طبّق الترحيلات بالترتيب على فرع Neon تجريبي أو Postgres محلي، وليس على الإنتاج مباشرة:

```bash
# Neon: create a branch in the console, put its URL in DATABASE_URL of .env.local
# Local PG: docker compose -f docker-compose.movies.yml --profile postgres up -d
#   DATABASE_URL=postgres://movies:movies-dev@localhost:5433/social_publisher
for f in drizzle/0019_movie_reels.sql drizzle/0020_movie_rights_reviews.sql drizzle/0021_movie_pipeline.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```
Note: the app uses the Neon HTTP driver; plain local Postgres needs the base schema (earlier migrations, `npm run db:migrate`) and may need a Neon-compatible proxy. A Neon branch is the simplest path.

## 3. Start services / تشغيل الخدمات
```bash
docker compose -f docker-compose.movies.yml up -d minio minio-init   # console: http://localhost:9001
npm run dev                                                          # http://localhost:3000
MOVIE_WORKER_SECRET=<same> docker compose -f docker-compose.movies.yml --profile worker up -d --build
docker compose -f docker-compose.movies.yml logs -f worker
```
The worker reaches the host app at `http://host.docker.internal:3000`; plain http is refused unless `MOVIE_ALLOW_INSECURE_API=1` (dev only).
Subtitles (optional): `python workers/movie-reels/download_model.py small workers/movie-reels/models/whisper-small`, then set `MOVIE_WHISPER_MODEL_DIR_IN_CONTAINER=/models/whisper-small`. Without a model, clips have no captions; write them in the dashboard.

## 4. End-to-end flow / المسار الكامل
1. Open `/movies`, register a movie and fill the rights form (licensed content only). / سجّل الفيلم وبيانات الحقوق.
2. Verify rights (reviewer). / اعتماد الحقوق من المراجع.
3. Upload the video (direct multipart PUT to MinIO; needs CORS with `ETag` exposed). / ارفع الفيديو.
4. Watch status: `uploaded → processing → review`; follow `logs -f worker`. / راقب المعالجة.
5. Review each clip, edit captions (creates a rerender), approve. / راجع المقاطع وعدّل الترجمة واعتمد.
6. Pick a page and schedule. With `MOVIE_PUBLISH_DRIVER=mock` publications are recorded but nothing is sent. / جدول؛ الناشر الوهمي لا يرسل شيئًا.

## 5. Tests / الاختبارات
```bash
npx tsx --test tests/movie-*.test.ts
npm test
cd workers/movie-reels && python -m unittest
```

## Bucket CORS for R2/S3 (production)
```json
[{"AllowedOrigins":["https://sp.leanpix.site"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
```
Bucket must stay private (no public access); the app only issues short-lived signed URLs.

## 6. Go-live checklist / قائمة التفعيل النهائي
- [ ] All tests pass (TS + Python) and one full mock run succeeded. / نجاح كل الاختبارات وتجربة كاملة.
- [ ] Migrations applied to production after a branch rehearsal. / تطبيق الترحيلات على الإنتاج بعد تجربتها.
- [ ] Storage provider chosen, private bucket, CORS limited to the production origin, scoped keys. / التخزين جاهز.
- [ ] Worker server running over https with a ≥32-char secret, no `MOVIE_ALLOW_INSECURE_API`. / خادم المعالجة جاهز.
- [ ] Content rights verified for every movie (license, territory, platforms, expiry, evidence). / التحقق من الحقوق.
- [ ] Meta page token valid with `pages_manage_posts`; `MOVIE_PUBLISH_DRIVER=meta`. / صلاحيات Meta.
- [ ] **Explicit written approval from the owner** — only then set `MOVIE_REELS_PUBLISHING_ENABLED=true`. / **الموافقة النهائية الصريحة من المالك** قبل تفعيل النشر التلقائي.
