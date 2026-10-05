import { NextRequest, NextResponse } from "next/server";
import { desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLogs, campaigns, contentGoals, facebookPages, mediaAssets, postMedia, postNotes, postRecurrences, posts, postTemplates, publicationAttempts, queueSlots, savedFilters } from "@/db/schema";
import { guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { systemAnalytics } from "@/services/analytics";
import { csvResponse, toCsv } from "@/services/export";

const LIMIT = 20000;
/** Exports: posts / attempts / activity / analytics as CSV, or a JSON content backup. No secrets are included. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const denied = await guard(request, false, "data.export"); if (denied) return denied;
  const { kind } = await params;
  const db = getDb();
  await logAudit("export.downloaded", "export", null, { kind });
  if (kind === "posts") {
    const rows = await db.select({ id: posts.id, page: facebookPages.name, content: posts.content, status: posts.status, scheduledAt: posts.scheduledAt, publishedAt: posts.publishedAt, category: posts.category, tags: posts.tags, campaign: campaigns.name, facebookPostId: posts.facebookPostId, permalink: posts.facebookPermalink, lastError: posts.lastError, createdAt: posts.createdAt }).from(posts).leftJoin(facebookPages, eq(posts.pageId, facebookPages.id)).leftJoin(campaigns, eq(posts.campaignId, campaigns.id)).where(isNull(posts.deletedAt)).orderBy(desc(posts.createdAt)).limit(LIMIT);
    return csvResponse(toCsv(rows.map((r) => ({ ...r, tags: r.tags.join(" ") })), [["id", "المعرف"], ["page", "الصفحة"], ["content", "النص"], ["status", "الحالة"], ["scheduledAt", "موعد النشر (UTC)"], ["publishedAt", "وقت النشر (UTC)"], ["category", "التصنيف"], ["tags", "الوسوم"], ["campaign", "الحملة"], ["facebookPostId", "معرف Facebook"], ["permalink", "الرابط"], ["lastError", "آخر خطأ"], ["createdAt", "أُنشئ"]]), "posts");
  }
  if (kind === "attempts") {
    const rows = await db.select({ postId: publicationAttempts.postId, attempt: publicationAttempts.attemptNumber, status: publicationAttempts.status, provider: publicationAttempts.provider, startedAt: publicationAttempts.startedAt, finishedAt: publicationAttempts.finishedAt, facebookPostId: publicationAttempts.facebookPostId, error: publicationAttempts.errorMessage }).from(publicationAttempts).orderBy(desc(publicationAttempts.startedAt)).limit(LIMIT);
    return csvResponse(toCsv(rows, [["postId", "المنشور"], ["attempt", "المحاولة"], ["status", "الحالة"], ["provider", "المزود"], ["startedAt", "البداية"], ["finishedAt", "النهاية"], ["facebookPostId", "معرف Facebook"], ["error", "الخطأ"]]), "publication-attempts");
  }
  if (kind === "activity") {
    const rows = await db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(LIMIT);
    return csvResponse(toCsv(rows, [["createdAt", "الوقت"], ["action", "الإجراء"], ["entityType", "النوع"], ["entityId", "المعرف"], ["metadata", "التفاصيل"]]), "activity-log");
  }
  if (kind === "analytics") {
    const a = await systemAnalytics();
    const rows = [
      ...Object.entries(a.totals).map(([k, v]) => ({ section: "الإجماليات", key: k, value: v })),
      { section: "الإجماليات", key: "successRate", value: a.successRate ?? "" },
      ...a.byDay.map((r) => ({ section: "حسب اليوم", key: r.label, value: r.count })),
      ...a.byHour.map((r) => ({ section: "حسب الساعة", key: r.label, value: r.count })),
      ...a.byPage.map((r) => ({ section: "حسب الصفحة", key: r.name, value: r.n })),
    ];
    return csvResponse(toCsv(rows, [["section", "القسم"], ["key", "البند"], ["value", "القيمة"]]), "analytics");
  }
  if (kind === "backup") {
    // Content only: tokens, passwords and env values are never part of the database tables exported here.
    const [p, m, t, c, med, n, r, g, q, f, pages] = await Promise.all([
      db.select().from(posts).limit(LIMIT), db.select().from(postMedia).limit(LIMIT), db.select().from(postTemplates), db.select().from(campaigns),
      db.select().from(mediaAssets), db.select().from(postNotes).limit(LIMIT), db.select().from(postRecurrences), db.select().from(contentGoals), db.select().from(queueSlots), db.select().from(savedFilters),
      db.select({ id: facebookPages.id, name: facebookPages.name, facebookPageId: facebookPages.facebookPageId, status: facebookPages.status }).from(facebookPages),
    ]);
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, pages, posts: p, postMedia: m, templates: t, campaigns: c, mediaAssets: med, notes: n, recurrences: r, goals: g, queueSlots: q, savedFilters: f }, null, 2);
    return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="social-publisher-backup-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "نوع تصدير غير معروف" }, { status: 404 });
}
