import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One-time maintenance: renders dynamic campaign images once, stores them as static files in Vercel Blob,
 * and points scheduled posts at the static copy (Facebook needs a fast, stable image URL).
 */
export async function POST(request: NextRequest) {
  const denied = await guard(request, true, "settings.manage");
  if (denied) return denied;
  const batch = Math.min(12, Number(request.nextUrl.searchParams.get("batch")) || 6);
  const db = getDb();
  const rows = (await db.execute(sql`select m.id, m.url from post_media m join posts p on p.id = m.post_id
    where m.url like '%/api/campaign-image/%' and p.deleted_at is null order by m.url limit ${batch}`)).rows as Array<{ id: string; url: string }>;
  const done: string[] = [];
  const failed: string[] = [];
  for (const row of rows) {
    const index = row.url.split("/api/campaign-image/")[1]?.split(/[?#]/)[0];
    try {
      const res = await fetch(`${request.nextUrl.origin}/api/campaign-image/${index}`, { signal: AbortSignal.timeout(60000) });
      if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) throw new Error(`HTTP ${res.status}`);
      const blob = await put(`campaigns/ai-automation-90d/static-${index}.png`, Buffer.from(await res.arrayBuffer()), { access: "public", contentType: "image/png", addRandomSuffix: true });
      await db.execute(sql`update post_media set url = ${blob.url} where url = ${row.url}`);
      done.push(index);
    } catch (error) { failed.push(`${index}: ${error instanceof Error ? error.message : "error"}`); }
  }
  const [left] = (await db.execute(sql`select count(*)::int as n from post_media where url like '%/api/campaign-image/%'`)).rows as Array<{ n: number }>;
  if (done.length) await logAudit("media.prerendered", "media", null, { count: done.length });
  return NextResponse.json({ done, failed, remaining: left?.n ?? 0 });
}
