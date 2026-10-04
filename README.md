# Social Publisher

Arabic RTL Facebook publishing dashboard built for Next.js + Neon PostgreSQL. The initial environment is safe by default: `PUBLISHING_ENABLED=false`.

## Local setup

1. Copy `.env.example` to `.env.local` and fill only the values you own.
2. Install dependencies with `npm install`.
3. Generate and run Drizzle migrations.
4. Start with `npm run dev`.

Facebook access is provider-owned through the Windsor Facebook MCP; the application does not accept or store Meta access tokens and does not call the Graph API directly. Windsor documents `create_post` and `create_photo_post` for `facebook_organic`, but the Vercel Worker still needs a server-side Windsor MCP URL plus machine credential before scheduled publishing can run.

Storage is intentionally provider-agnostic. Configure Cloudinary or Vercel Blob before enabling image uploads in production.

When the Vercel runtime connection is configured and verified, implement the MCP tool calls inside `src/services/facebook.ts`, then test with `PUBLISHING_ENABLED=false`. Do not enable `PUBLISHING_ENABLED=true` without explicit approval.

The protected `/api/cron/publish` endpoint is intentionally not declared as a Vercel Hobby Cron because Hobby accounts only support daily schedules. Use an external scheduler (for example cron-job.org or GitHub Actions) to call it at the required frequency with `CRON_SECRET`.
