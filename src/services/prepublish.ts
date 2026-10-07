import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, posts, schedulerRuns } from "@/db/schema";
import { isGraphConfigured } from "./facebook-graph";
import { probeImageUrl } from "./storage";
import { getPublishingRules } from "./rules-store";
import { violation } from "./publishing-rules";
import type { WorkspaceContext } from "./workspace-request";
import { workspacePostPermissionPredicate } from "./workspace-posts";

export type CheckItem = { key: string; label: string; ok: boolean; critical: boolean; detail?: string };
export const CONFLICT_WINDOW_MINUTES = 5;

/** Posts already scheduled within ±5 minutes of `at` (excluding `excludeId`). A warning, never a block. */
export async function nearbyScheduled(at: Date, excludeId?: string, workspace?:WorkspaceContext) {
  const windowMs = CONFLICT_WINDOW_MINUTES * 60000;
  const [row] = await getDb().select({total:sql<number>`count(*)::int`}).from(posts).where(and(eq(posts.status, "scheduled"), isNull(posts.deletedAt), gte(posts.scheduledAt, new Date(at.getTime() - windowMs)), lte(posts.scheduledAt, new Date(at.getTime() + windowMs)), excludeId ? ne(posts.id, excludeId) : undefined,workspace?workspacePostPermissionPredicate(workspace,["posts.read"]):undefined));
  return row.total;
}

/**
 * Pre-scheduling checklist. Critical failures (page, content, time, image, publishing credentials)
 * must block scheduling; scheduler health and time conflicts are warnings.
 */
export async function prePublishChecks(input: { pageId: string; content: string; scheduledAt?: Date | null; imageUrl?: string | null; postId?: string; workspace?:WorkspaceContext }): Promise<{ items: CheckItem[]; blocking: boolean }> {
  const db = getDb();
  const items: CheckItem[] = [];
  const [page] = await db.select({ isActive: facebookPages.isActive, name: facebookPages.name, accessTokenEnc: facebookPages.accessTokenEnc }).from(facebookPages).where(eq(facebookPages.id, input.pageId)).limit(1);
  items.push({ key: "page", label: "الصفحة متصلة", ok: Boolean(page?.isActive), critical: true, detail: page ? page.name : "الصفحة غير موجودة" });
  const text = input.content.trim();
  items.push({ key: "content", label: "النص صالح", ok: text.length > 0 && text.length <= 63206, critical: true, detail: text.length ? `${text.length} حرفًا` : "النص فارغ" });
  const future = Boolean(input.scheduledAt && input.scheduledAt.getTime() > Date.now() + 60000);
  items.push({ key: "time", label: "الوقت صالح", ok: future, critical: true, detail: input.scheduledAt ? (future ? undefined : "الموعد في الماضي أو خلال أقل من دقيقة") : "لم يُحدد موعد" });
  if (input.imageUrl) {
    const probe = await probeImageUrl(input.imageUrl);
    items.push({ key: "image", label: "الصورة متاحة", ok: probe.ok, critical: true, detail: probe.ok ? probe.mimeType : probe.reason });
  }
  const connected = Boolean(page?.accessTokenEnc) || isGraphConfigured() || Boolean(process.env.WINDSOR_API_KEY);
  items.push({ key: "facebook", label: "اتصال Facebook مُعد", ok: connected, critical: true, detail: page?.accessTokenEnc ? "توكن مشفّر خاص بالصفحة" : isGraphConfigured() ? "توكن Meta احتياطي" : connected ? "Windsor MCP" : "لا يوجد اتصال نشر" });
  if (text) {
    const normalized = text.replace(/\s+/g, " ").trim().toLocaleLowerCase("ar");
    const duplicateRows = await db.select({ id: posts.id, status: posts.status, scheduledAt: posts.scheduledAt, publishedAt: posts.publishedAt })
      .from(posts)
      .where(and(
        eq(posts.pageId, input.pageId),
        inArray(posts.status, ["scheduled", "published"]),
        isNull(posts.deletedAt),
        input.workspace?workspacePostPermissionPredicate(input.workspace,["posts.read"]):undefined,
        input.postId ? ne(posts.id, input.postId) : undefined,
        sql`lower(regexp_replace(trim(${posts.content}), '\\s+', ' ', 'g')) = ${normalized}`
      ))
      .orderBy(desc(posts.createdAt))
      .limit(3);
    items.push({
      key: "duplicate",
      label: "المحتوى غير مكرر",
      ok: duplicateRows.length === 0,
      critical: false,
      detail: duplicateRows.length
        ? `وُجد ${duplicateRows.length} منشور مطابق نصيًا على نفس الصفحة. راجع التكرار قبل النشر.`
        : undefined,
    });
  }
  const [run] = await db.select({ at: schedulerRuns.triggeredAt }).from(schedulerRuns).orderBy(desc(schedulerRuns.triggeredAt)).limit(1);
  const healthy = Boolean(run && Date.now() - run.at.getTime() < 10 * 60000);
  items.push({ key: "scheduler", label: "عامل النشر يعمل", ok: healthy, critical: false, detail: healthy ? undefined : "لم يعمل خلال آخر 10 دقائق" });
  if (future) {
    const rules = await getPublishingRules();
    const reason = violation(input.scheduledAt!, rules);
    items.push({ key: "window", label: "ضمن أوقات النشر المسموحة", ok: !reason, critical: false, detail: reason ? `${reason}${rules.window.mode === "shift" ? " — سيُنقل تلقائيًا لأول وقت مسموح" : ""}` : undefined });
    const nearby = await nearbyScheduled(input.scheduledAt!, input.postId,input.workspace);
    items.push({ key: "conflict", label: "لا تعارض في الموعد", ok: nearby < 2, critical: false, detail: nearby ? `يوجد ${nearby} منشور مجدول خلال ${CONFLICT_WINDOW_MINUTES} دقائق من هذا الموعد` : undefined });
  }
  return { items, blocking: items.some((i) => i.critical && !i.ok) };
}

/** Clusters of 3+ scheduled posts within 5 minutes, for calendar/queue warnings. */
export async function scheduleClusters(from: Date, to: Date) {
  const result = await getDb().execute(sql`
    select a.id, count(b.id)::int as nearby, a.scheduled_at
    from ${posts} a join ${posts} b on b.status = 'scheduled' and b.deleted_at is null and b.id <> a.id
      and b.scheduled_at between a.scheduled_at - interval '5 minutes' and a.scheduled_at + interval '5 minutes'
    where a.status = 'scheduled' and a.deleted_at is null and a.scheduled_at between ${from.toISOString()}::timestamptz and ${to.toISOString()}::timestamptz
    group by a.id, a.scheduled_at having count(b.id) >= 2 order by a.scheduled_at`);
  return result.rows as Array<{ id: string; nearby: number; scheduled_at: string }>;
}
