# Social Publisher

Arabic RTL Facebook publishing dashboard built for Next.js + Neon PostgreSQL. The initial environment is safe by default: `PUBLISHING_ENABLED=false`.

## Local setup

1. Copy `.env.example` to `.env.local` and fill only the values you own.
2. Install dependencies with `npm install`.
3. Generate and run Drizzle migrations.
4. Start with `npm run dev`.

The Facebook token is server-only and is never returned to the browser. Publishing stays in dry-run mode until explicitly enabled.

Storage is intentionally provider-agnostic. Configure Cloudinary or Vercel Blob before enabling image uploads in production.

The protected `/api/cron/publish` endpoint is intentionally not declared as a Vercel Hobby Cron because Hobby accounts only support daily schedules. Use an external scheduler (for example cron-job.org or GitHub Actions) to call it at the required frequency with `CRON_SECRET`.
