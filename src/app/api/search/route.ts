import { NextRequest, NextResponse } from "next/server";
import { and, desc, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLogs, campaigns, facebookPages, mediaAssets, posts, postTemplates } from "@/db/schema";
import { guard } from "@/services/api-guard";
import { currentUser,can } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { discoveryPageScope,discoveryMediaScope,discoveryCampaignScope } from "@/services/discovery-access";
import { leadSearchQuery } from "@/services/leads-search";

/** Global search across posts, templates, media, pages, campaigns and logs. Each group is capped. */
export async function GET(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const like = `%${q.replace(/[%_\\]/g, "")}%`;
  try {
  const user=await currentUser(request);
  if(!user)return NextResponse.json({error:"يرجى تسجيل الدخول"},{status:401});
  const allowed=await allowedPageIds(user);
  const db = getDb();
  const [p, t, m, pg, c, l, leads] = await Promise.all([
    db.select({ id: posts.id, text: posts.content, status: posts.status }).from(posts).where(and(isNull(posts.deletedAt),discoveryPageScope(allowed,posts.pageId),or(ilike(posts.content, like), sql`${q} = any(${posts.tags})`))).orderBy(desc(posts.createdAt)).limit(8),
    allowed===null ? db.select({ id: postTemplates.id, text: postTemplates.name }).from(postTemplates).where(or(ilike(postTemplates.name, like), ilike(postTemplates.content, like))).limit(5) : Promise.resolve([]),
    db.select({ id: mediaAssets.id, text: mediaAssets.name }).from(mediaAssets).where(and(isNull(mediaAssets.deletedAt),discoveryMediaScope(allowed),ilike(mediaAssets.name, like))).limit(5),
    db.select({ id: facebookPages.id, text: facebookPages.name }).from(facebookPages).where(and(discoveryPageScope(allowed,facebookPages.id),ilike(facebookPages.name, like))).limit(3),
    db.select({ id: campaigns.id, text: campaigns.name }).from(campaigns).where(and(discoveryCampaignScope(allowed),ilike(campaigns.name, like))).limit(5),
    can(user.role,"audit.read") ? db.select({ id: activityLogs.id, text: activityLogs.action }).from(activityLogs).where(ilike(activityLogs.action, like)).orderBy(desc(activityLogs.createdAt)).limit(5) : Promise.resolve([]),
    can(user.role,"leads.read") ? db.execute(leadSearchQuery(q,allowed)).then(result=>result.rows as Array<{id:string;text:string}>) : Promise.resolve([]),
  ]);
  const results = [
    ...p.map((r) => ({ type: "منشور", label: r.text.slice(0, 90), href: `/posts/${r.id}` })),
    ...t.map((r) => ({ type: "قالب", label: r.text, href: `/templates#${r.id}` })),
    ...m.map((r) => ({ type: "وسائط", label: r.text, href: `/media?q=${encodeURIComponent(r.text)}` })),
    ...pg.map((r) => ({ type: "صفحة", label: r.text, href: "/pages" })),
    ...c.map((r) => ({ type: "حملة", label: r.text, href: `/campaigns/${r.id}` })),
    ...l.map((r) => ({ type: "سجل", label: r.text, href: "/logs" })),
    ...leads.map((r) => ({ type: "عميل محتمل", label: r.text.slice(0,90), href: `/leads/${r.id}` })),
  ];
  return NextResponse.json({ results },{headers:{"Cache-Control":"private, no-store"}});
  } catch {
    console.error("Global search unavailable",{code:"SEARCH_UNAVAILABLE"});
    return NextResponse.json({error:"تعذر البحث. حاول مجددًا."},{status:503});
  }
}
