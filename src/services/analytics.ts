import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, posts, publicationAttempts } from "@/db/schema";
import { engagementOf, getPostPerformance } from "./post-insights";

export const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const hourLabel = (h: number) => new Intl.DateTimeFormat("ar-SA", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, h)));

/** System analytics from aggregates only; no full-table fetches. */
export async function systemAnalytics(campaignId?: string, allowed: Set<string> | null = null) {
  const db = getDb();
  const scope = and(isNull(posts.deletedAt), campaignId ? eq(posts.campaignId, campaignId) : undefined, allowed === null ? undefined : allowed.size ? inArray(posts.pageId, Array.from(allowed)) : sql`false`);
  const [totals] = await db.select({
    total: sql<number>`count(*)::int`,
    published: sql<number>`count(*) filter (where ${posts.status}='published')::int`,
    failed: sql<number>`count(*) filter (where ${posts.status}='failed')::int`,
    scheduled: sql<number>`count(*) filter (where ${posts.status}='scheduled')::int`,
    pending: sql<number>`count(*) filter (where ${posts.status}='pending_approval')::int`,
    drafts: sql<number>`count(*) filter (where ${posts.status}='draft')::int`,
    thisWeek: sql<number>`count(*) filter (where ${posts.status}='published' and ${posts.publishedAt} > now() - interval '7 days')::int`,
    lastWeek: sql<number>`count(*) filter (where ${posts.status}='published' and ${posts.publishedAt} between now() - interval '14 days' and now() - interval '7 days')::int`,
  }).from(posts).where(scope);
  // Success rate counts real attempts only (dry runs excluded).
  const [attempts] = await db.select({ ok: sql<number>`count(*) filter (where ${publicationAttempts.status}='success')::int`, bad: sql<number>`count(*) filter (where ${publicationAttempts.status} in ('failed','outcome_unknown'))::int` }).from(publicationAttempts).innerJoin(posts, eq(publicationAttempts.postId, posts.id)).where(scope);
  const byDay = await db.select({ d: sql<number>`extract(dow from ${posts.publishedAt} at time zone 'Asia/Riyadh')::int`, n: sql<number>`count(*)::int` }).from(posts).where(and(scope, eq(posts.status, "published"))).groupBy(sql`1`).orderBy(sql`2 desc`);
  const byHour = await db.select({ h: sql<number>`extract(hour from ${posts.publishedAt} at time zone 'Asia/Riyadh')::int`, n: sql<number>`count(*)::int` }).from(posts).where(and(scope, eq(posts.status, "published"))).groupBy(sql`1`).orderBy(sql`2 desc`);
  const byPage = await db.select({ name: facebookPages.name, n: sql<number>`count(*)::int` }).from(posts).innerJoin(facebookPages, eq(posts.pageId, facebookPages.id)).where(scope).groupBy(facebookPages.name);
  const attemptsTotal = attempts.ok + attempts.bad;
  return {
    totals,
    successRate: attemptsTotal ? Math.round((attempts.ok / attemptsTotal) * 1000) / 10 : null,
    attemptsTotal,
    byDay: byDay.map((r) => ({ label: WEEKDAYS[r.d], count: r.n })),
    byHour: byHour.map((r) => ({ label: hourLabel(r.h), count: r.n })),
    byPage,
  };
}

/** Factual one-liners derived from the aggregates. Returns nothing when there is too little data. */
export function insightsFrom(a: Awaited<ReturnType<typeof systemAnalytics>>) {
  const lines: string[] = [];
  if (a.totals.lastWeek > 0) {
    const change = Math.round(((a.totals.thisWeek - a.totals.lastWeek) / a.totals.lastWeek) * 100);
    lines.push(change === 0 ? "نشرت هذا الأسبوع نفس عدد الأسبوع الماضي." : `نشرت هذا الأسبوع ${Math.abs(change)}% ${change > 0 ? "أكثر" : "أقل"} من الأسبوع الماضي.`);
  } else if (a.totals.thisWeek > 0) lines.push(`نشرت ${a.totals.thisWeek} منشورًا خلال آخر 7 أيام.`);
  if (a.successRate !== null && a.attemptsTotal >= 3) lines.push(`نسبة نجاح النشر ${a.successRate}% من ${a.attemptsTotal} محاولة.`);
  if (a.byHour[0] && a.totals.published >= 3) lines.push(`أكثر وقت تنشر فيه: ${a.byHour[0].label}.`);
  return lines;
}

/**
 * Best time from real engagement of recent published posts. Requires at least `minPosts` posts with
 * engagement data; otherwise returns null so no fabricated recommendation is shown.
 */
export async function bestTimeFromEngagement(limit = 15, minPosts = 5, allowed: Set<string> | null = null) {
  const rows = await getDb().select({ fbId: posts.facebookPostId, at: posts.publishedAt, pageFbId: facebookPages.facebookPageId }).from(posts).innerJoin(facebookPages, eq(posts.pageId, facebookPages.id)).where(and(eq(posts.status, "published"), isNotNull(posts.facebookPostId), isNull(posts.deletedAt), allowed === null ? undefined : allowed.size ? inArray(posts.pageId, Array.from(allowed)) : sql`false`)).orderBy(desc(posts.publishedAt)).limit(limit);
  const samples = (await Promise.all(rows.map(async (row) => ({ row, perf: await getPostPerformance(row.fbId!, row.pageFbId) })))).filter((s) => s.perf.available);
  if (samples.length < minPosts) return { recommendation: null, samples: samples.length, posts: samples };
  const buckets = new Map<string, { total: number; n: number }>();
  for (const { row, perf } of samples) {
    const local = new Date(row.at!.getTime() + 3 * 3600000);
    const key = `${local.getUTCDay()}-${local.getUTCHours()}`;
    const bucket = buckets.get(key) ?? { total: 0, n: 0 };
    bucket.total += engagementOf(perf); bucket.n++;
    buckets.set(key, bucket);
  }
  const [bestKey, best] = [...buckets.entries()].sort((a, b) => b[1].total / b[1].n - a[1].total / a[1].n)[0];
  const [day, hour] = bestKey.split("-").map(Number);
  return { recommendation: { label: `${WEEKDAYS[day]} ${hourLabel(hour)}`, avgEngagement: Math.round((best.total / best.n) * 10) / 10, basedOn: best.n }, samples: samples.length, posts: samples };
}
