import { NextRequest, NextResponse } from "next/server";
import { and, desc, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLogs, campaigns, facebookPages, mediaAssets, posts, postTemplates } from "@/db/schema";
import { guard } from "@/services/api-guard";

/** Global search across posts, templates, media, pages, campaigns and logs. Each group is capped. */
export async function GET(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const like = `%${q.replace(/[%_\\]/g, "")}%`;
  const db = getDb();
  const [p, t, m, pg, c, l] = await Promise.all([
    db.select({ id: posts.id, text: posts.content, status: posts.status }).from(posts).where(and(isNull(posts.deletedAt), or(ilike(posts.content, like), sql`${q} = any(${posts.tags})`))).orderBy(desc(posts.createdAt)).limit(8),
    db.select({ id: postTemplates.id, text: postTemplates.name }).from(postTemplates).where(or(ilike(postTemplates.name, like), ilike(postTemplates.content, like))).limit(5),
    db.select({ id: mediaAssets.id, text: mediaAssets.name }).from(mediaAssets).where(and(isNull(mediaAssets.deletedAt), ilike(mediaAssets.name, like))).limit(5),
    db.select({ id: facebookPages.id, text: facebookPages.name }).from(facebookPages).where(ilike(facebookPages.name, like)).limit(3),
    db.select({ id: campaigns.id, text: campaigns.name }).from(campaigns).where(ilike(campaigns.name, like)).limit(5),
    db.select({ id: activityLogs.id, text: activityLogs.action }).from(activityLogs).where(ilike(activityLogs.action, like)).orderBy(desc(activityLogs.createdAt)).limit(5),
  ]);
  const results = [
    ...p.map((r) => ({ type: "منشور", label: r.text.slice(0, 90), href: `/posts/${r.id}` })),
    ...t.map((r) => ({ type: "قالب", label: r.text, href: `/templates#${r.id}` })),
    ...m.map((r) => ({ type: "وسائط", label: r.text, href: `/media?q=${encodeURIComponent(r.text)}` })),
    ...pg.map((r) => ({ type: "صفحة", label: r.text, href: "/pages" })),
    ...c.map((r) => ({ type: "حملة", label: r.text, href: `/campaigns/${r.id}` })),
    ...l.map((r) => ({ type: "سجل", label: r.text, href: "/logs" })),
  ];
  return NextResponse.json({ results });
}
