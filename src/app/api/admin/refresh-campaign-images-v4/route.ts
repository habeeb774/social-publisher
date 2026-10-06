import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const expected = process.env.IMAGE_REPAIR_TOKEN;
  const auth = request.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const origin = "https://social-publisher-gamma.vercel.app";
  const version = "v4";

  const updatedPostMedia = (await db.execute(sql`
    WITH indexed_posts AS (
      SELECT DISTINCT
        p.id AS post_id,
        ((regexp_match(tag, '^plan-index-([0-9]+)$'))[1])::int AS idx
      FROM posts p
      JOIN campaigns c ON c.id = p.campaign_id
      CROSS JOIN LATERAL unnest(p.tags) AS tag
      WHERE c.name = 'AI Automation — 90 يوم'
        AND p.deleted_at IS NULL
        AND tag ~ '^plan-index-[0-9]+$'
    )
    UPDATE post_media pm
    SET
      url = ${origin} || '/api/campaign-image/' || ip.idx::text || '?v=' || ${version},
      storage_key = NULL,
      mime_type = 'image/png',
      size = NULL
    FROM indexed_posts ip
    WHERE pm.post_id = ip.post_id
      AND pm.type = 'image'
    RETURNING pm.post_id, pm.url
  `)).rows;

  const updatedAssets = (await db.execute(sql`
    UPDATE media_assets
    SET
      url = ${origin} || '/api/campaign-image/' ||
        ((regexp_match(name, '^AI Automation ([0-9]+)[.]png$'))[1])::int::text ||
        '?v=' || ${version},
      storage_key = NULL,
      mime_type = 'image/png',
      size = NULL
    WHERE name ~ '^AI Automation [0-9]+[.]png$'
    RETURNING id, name, url
  `)).rows;

  const [verification] = (await db.execute(sql`
    SELECT
      count(DISTINCT p.id)::int AS campaign_posts,
      count(DISTINCT pm.id) FILTER (
        WHERE pm.type = 'image'
          AND pm.url LIKE '%/api/campaign-image/%?v=v4'
      )::int AS campaign_post_images_v4
    FROM posts p
    JOIN campaigns c ON c.id = p.campaign_id
    LEFT JOIN post_media pm ON pm.post_id = p.id
    WHERE c.name = 'AI Automation — 90 يوم'
      AND p.deleted_at IS NULL
  `)).rows as Array<{ campaign_posts: number; campaign_post_images_v4: number }>;

  const [assetVerification] = (await db.execute(sql`
    SELECT count(*)::int AS assets_v4
    FROM media_assets
    WHERE name ~ '^AI Automation [0-9]+[.]png$'
      AND url LIKE '%/api/campaign-image/%?v=v4'
  `)).rows as Array<{ assets_v4: number }>;

  return NextResponse.json({
    ok: true,
    updatedPostMedia: updatedPostMedia.length,
    updatedAssets: updatedAssets.length,
    verification,
    assetVerification,
  });
}
