# Social Publisher

Arabic RTL Facebook publishing dashboard built for Next.js + Neon PostgreSQL. The initial environment is safe by default: `PUBLISHING_ENABLED=false`.

## Local setup

1. Copy `.env.example` to `.env.local` and fill only the values you own.
2. Install dependencies with `npm install`.
3. Generate and run Drizzle migrations.
4. Start with `npm run dev`.

Facebook access is provider-owned through the Windsor Facebook MCP; the application does not accept or store Meta access tokens and does not call the Graph API directly. Windsor documents `create_post` and `create_photo_post` for `facebook_organic`, but the Vercel Worker still needs a server-side Windsor MCP URL plus machine credential before scheduled publishing can run.

Storage is intentionally provider-agnostic. Configure Cloudinary or Vercel Blob before enabling image uploads in production.

The Vercel runtime connection is verified through `/api/integrations/facebook/test` without invoking a write tool. Keep `PUBLISHING_ENABLED=false` while validating the provider layer. Do not enable `PUBLISHING_ENABLED=true` without explicit approval.

The protected `/api/cron/publish` endpoint accepts the `Authorization: Bearer $CRON_SECRET` header and supports GET and POST. The native Vercel Cron configuration is intentionally absent so the Hobby plan can deploy successfully. Configure an external scheduler such as cron-job.org to call the endpoint every minute with `CRON_SECRET`.
