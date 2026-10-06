import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!process.env.CONTENT_SEED_TOKEN || request.nextUrl.searchParams.get("token") !== process.env.CONTENT_SEED_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }

  const db = neon(process.env.DATABASE_URL);
  const origin = "https://social-publisher-gamma.vercel.app";

  const updatedPosts = await db\`
    WITH numbered AS (
      SELECT DISTINCT p.id,
        ((regexp_match(tag, '^plan-index-([0-9]+)$'))[1])::int AS idx
      FROM posts p
      JOIN campaigns c ON c.id = p.campaign_id
      CROSS JOIN LATERAL unnest(p.tags) AS tag
      WHERE c.name = 'AI Automation — 90 يوم'
        AND tag ~ '^plan-index-[0-9]+$'
    )
    UPDATE post_media pm
    SET url = \${origin} || '/api/campaign-image/' || numbered.idx::text || '?v=3',
        storage_key = NULL,
        mime_type = 'image/png',
        size = NULL
    FROM numbered
    WHERE pm.post_id = numbered.id
      AND pm.type = 'image'
    RETURNING pm.post_id, pm.url
  \`;

  const updatedAssets = await db\`
    UPDATE media_assets
    SET url = \${origin} || '/api/campaign-image/' ||
      ((regexp_match(name, '^AI Automation ([0-9]+)[.]png$'))[1])::int::text || '?v=3',
      storage_key = NULL,
      mime_type = 'image/png',
      size = NULL
    WHERE source = 'campaign-generator'
      AND name ~ '^AI Automation [0-9]+[.]png$'
    RETURNING id, name, url
  \`;

  const [verification] = await db\`
    SELECT
      count(*)::int AS posts,
      count(*) FILTER (WHERE pm.url LIKE '%/api/campaign-image/%?v=3')::int AS v3_images
    FROM posts p
    JOIN campaigns c ON c.id = p.campaign_id
    LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.type = 'image'
    WHERE c.name = 'AI Automation — 90 يوم'
  \`;

  await db\`
    INSERT INTO activity_logs(action, entity_type, metadata)
    VALUES(
      'campaign.images_repaired',
      'campaign',
      \${JSON.stringify({ version: 3, postMedia: updatedPosts.length, mediaAssets: updatedAssets.length })}::jsonb
    )
  \`;

  return NextResponse.json({
    ok: true,
    postMediaUpdated: updatedPosts.length,
    mediaAssetsUpdated: updatedAssets.length,
    verification,
  });
}
