import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLogs, facebookPages, postMedia, posts } from "@/db/schema";
import { auditLabel } from "./audit-labels";
import { runDiagnostics } from "./diagnostics";

const DAYS = 14;

/** Everything the executive dashboard needs, as aggregates and small capped lists. */
export async function dashboardData(allowed: Set<string> | null = null) {
  const db = getDb();
  const scope = allowed === null ? undefined : allowed.size ? inArray(posts.pageId, Array.from(allowed)) : sql`false`;
  const allowedCsv = allowed === null ? "" : Array.from(allowed).join(",");
  const scoped = allowed !== null;
  const since = new Date(Date.now() - (DAYS - 1) * 86400000);
  const [[totals], daily, upcoming, activity, comments, diag, syncRun] = await Promise.all([
    db.select({
      today: sql<number>`count(*) filter (where ${posts.status}='published' and (${posts.publishedAt} at time zone 'Asia/Riyadh')::date=(now() at time zone 'Asia/Riyadh')::date)::int`,
      yesterday: sql<number>`count(*) filter (where ${posts.status}='published' and (${posts.publishedAt} at time zone 'Asia/Riyadh')::date=(now() at time zone 'Asia/Riyadh')::date - 1)::int`,
      scheduled: sql<number>`count(*) filter (where ${posts.status}='scheduled')::int`,
      scheduledToday: sql<number>`count(*) filter (where ${posts.status}='scheduled' and (${posts.scheduledAt} at time zone 'Asia/Riyadh')::date=(now() at time zone 'Asia/Riyadh')::date)::int`,
      pending: sql<number>`count(*) filter (where ${posts.status}='pending_approval')::int`,
      failed: sql<number>`count(*) filter (where ${posts.status}='failed')::int`,
    }).from(posts).where(and(isNull(posts.deletedAt), scope)),
    db.select({ day: sql<string>`to_char(${posts.publishedAt} at time zone 'Asia/Riyadh','YYYY-MM-DD')`, n: sql<number>`count(*)::int` }).from(posts).where(and(eq(posts.status, "published"), gte(posts.publishedAt, since), scope)).groupBy(sql`1`),
    db.select({ id: posts.id, content: posts.content, scheduledAt: posts.scheduledAt, status: posts.status, page: facebookPages.name, image: sql<string | null>`(select ${postMedia.url} from ${postMedia} where ${postMedia.postId} = ${posts.id} limit 1)` }).from(posts).leftJoin(facebookPages, eq(posts.pageId, facebookPages.id)).where(and(eq(posts.status, "scheduled"), isNull(posts.deletedAt), scope)).orderBy(asc(posts.scheduledAt)).limit(6),
    db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(7),
    db.execute(sql`select id, message, author_name, created_time, status from facebook_comments where needs_reply and status not in ('spam','hidden','resolved','replied') and (${scoped}=false or page_id::text = any(string_to_array(${allowedCsv}, ','))) order by created_time desc limit 5`).then((r) => r.rows as Array<{ id: string; message: string; author_name: string | null; created_time: string; status: string }>).catch(() => null),
    runDiagnostics(false),
    db.execute(sql`select status, error_code, started_at from comments_sync_runs order by started_at desc limit 1`).then((r) => (r.rows[0] as { status: string; error_code: string | null; started_at: string } | undefined) ?? null).catch(() => undefined),
  ]);
  const commentsWaiting = comments === null ? null : await db.execute(
    sql`select count(*)::int as n from facebook_comments where needs_reply and status not in ('spam','hidden','resolved','replied') and (${scoped}=false or page_id::text = any(string_to_array(${allowedCsv}, ',')))`
  ).then((r) => Number((r.rows[0] as { n: number }).n)).catch(() => null);
  // Success rate over the last 30 days of real attempts.
  const rate = await db.execute(
    sql`select count(*) filter (where a.status='success')::int as ok, count(*) filter (where a.status in ('failed','outcome_unknown'))::int as bad from publication_attempts a join posts p on p.id=a.post_id where a.started_at > now() - interval '30 days' and (${scoped}=false or p.page_id::text = any(string_to_array(${allowedCsv}, ',')))`
  ).then((r) => r.rows[0] as { ok: number; bad: number });
  const successRate = rate.ok + rate.bad ? Math.round((rate.ok / (rate.ok + rate.bad)) * 1000) / 10 : null;
  let scopedActivity = activity;
  if (allowed !== null) {
    const postIds = activity.filter((item) => item.entityType === "post" && item.entityId).map((item) => item.entityId!).slice(0, 50);
    const visiblePostIds = postIds.length && allowed.size
      ? new Set((await db.select({ id: posts.id }).from(posts).where(and(inArray(posts.id, postIds), inArray(posts.pageId, Array.from(allowed))))).map((row) => row.id))
      : new Set<string>();
    scopedActivity = activity.filter((item) => item.entityType !== "post" || !item.entityId || visiblePostIds.has(item.entityId));
  }

  const series = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(Date.now() + 3 * 3600000 - (DAYS - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { day: d, count: daily.find((x) => x.day === d)?.n ?? 0 };
  });
  return {
    totals, successRate, attempts: rate.ok + rate.bad, series, upcoming, commentsWaiting, comments: comments ?? [],
    activity: scopedActivity.map((a) => ({ id: a.id, label: auditLabel(a.action), entityType: a.entityType, entityId: a.entityId, actor: String((a.metadata as Record<string, unknown> | null)?.actor ?? "النظام"), at: a.createdAt })),
    health: diag, commentsSync: syncRun,
  };
}
