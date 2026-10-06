import Link from "next/link";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, publicationAttempts } from "@/db/schema";
import { classifyError } from "@/services/error-classes";
import { pageCan, pageSession } from "@/services/session-server";
import { allowedPageIds } from "@/services/access-scope";
import { AppShell } from "../ui/app-shell";
import { riyadh } from "../ui/api";
import { Card, MetricStrip, PageHeader } from "../ui/kit";
import { FailedClient } from "./failed-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "مركز الفشل" };
type Reply = { id: string; comment_id: string; content: string; error: string | null; updated_at: string };
type Sync = { status: string; error_code: string | null; started_at: string };

export default async function Failed() {
  const db = getDb();
  const session = await pageSession();
  const allowed = session ? await allowedPageIds({ id: session.userId, role: session.role }) : new Set<string>();
  const postScope = allowed === null ? undefined : allowed.size ? inArray(posts.pageId, Array.from(allowed)) : sql`false`;
  const scoped = allowed !== null;
  const allowedCsv = allowed === null ? "" : Array.from(allowed).join(",");
  const [rows, recovering, replies, syncs, canRetry] = await Promise.all([
    db.select({ id: posts.id, content: posts.content, lastError: posts.lastError, failedAt: posts.failedAt, attempts: sql<number>`count(${publicationAttempts.id})::int`, lastAttempt: sql<Date | null>`max(${publicationAttempts.startedAt})` })
      .from(posts).leftJoin(publicationAttempts, eq(publicationAttempts.postId, posts.id)).where(and(eq(posts.status, "failed"), isNull(posts.deletedAt), postScope)).groupBy(posts.id).orderBy(desc(posts.failedAt)).limit(100),
    db.select({
      id: posts.id,
      content: posts.content,
      lastError: posts.lastError,
      scheduledAt: posts.scheduledAt,
      attempts: sql<number>`(select count(*)::int from publication_attempts pa where pa.post_id = ${posts.id})`,
    }).from(posts).where(and(
      eq(posts.status, "scheduled"),
      isNull(posts.deletedAt),
      isNotNull(posts.lastError),
      postScope,
      sql`exists (select 1 from publication_attempts pa where pa.post_id = ${posts.id} and pa.status = 'failed')`
    )).orderBy(asc(posts.scheduledAt)).limit(50),
    db.execute(sql`select r.id, r.comment_id, r.content, coalesce(r.error_code, r.error_message) as error, r.updated_at from comment_replies r join facebook_comments c on c.id=r.comment_id where r.status = 'failed' and (${scoped}=false or c.page_id::text = any(string_to_array(${allowedCsv}, ','))) order by r.updated_at desc limit 50`).then((r) => r.rows as Reply[]).catch(() => [] as Reply[]),
    allowed === null ? db.execute(sql`select status, error_code, started_at from comments_sync_runs where status not in ('success','completed') order by started_at desc limit 20`).then((r) => r.rows as Sync[]).catch(() => [] as Sync[]) : Promise.resolve([] as Sync[]),
    pageCan("content.publish"),
  ]);
  const classified = rows.map((r) => ({ ...r, kind: classifyError(r.lastError) }));
  const retryableCount = classified.filter((r) => r.kind.retryable).length;
  const authCount = classified.filter((r) => r.kind.key === "authorization").length;
  const uncertainCount = classified.filter((r) => r.kind.key === "uncertain").length;
  return <AppShell title="مركز الفشل">
    <PageHeader title="مركز الفشل" description="مركز الاستعادة: يتعافى النظام تلقائيًا من الأخطاء المؤقتة فقط، ولا يعيد الحالات غير المؤكدة أو أخطاء الصلاحيات تلقائيًا." />
    <MetricStrip items={[
      { label: "قيد الاستعادة تلقائيًا", value: recovering.length, hint: "إعادة بعد 5 ثم 15 دقيقة" },
      { label: "فشل نهائي", value: rows.length, hint: "يحتاج مراجعة أو إعادة يدوية" },
      { label: "قابل لإعادة يدوية", value: retryableCount },
      { label: "صلاحيات / توكن", value: authCount, hint: "لا يُعاد تلقائيًا" },
      { label: "نتيجة غير مؤكدة", value: uncertainCount, hint: "تحقق من Facebook أولًا" },
    ]} />
    {recovering.length > 0 && <div style={{ marginBottom: 16 }}><Card title={`قيد الاستعادة تلقائيًا (${recovering.length})`}>
      <div className="list">{recovering.map((r) => <Link key={r.id} href={`/posts/${r.id}`} className="list-row">
        <span className="grow"><span className="clamp-2">{r.content}</span><small>{classifyError(r.lastError).label} · المحاولة القادمة تلقائيًا</small></span>
        <span className="stack" style={{ gap: 2, alignItems: "end" }}><strong>{riyadh(r.scheduledAt)}</strong><small>محاولات سابقة: {r.attempts}</small></span>
      </Link>)}</div>
    </Card></div>}
    <section className="card card-flush" style={{ marginBottom: 16 }}><div className="card-header" style={{ padding: "16px 20px 8px" }}><h2>فشل نهائي</h2><small>{rows.length}</small></div>
      <FailedClient canRetry={canRetry} rows={classified.map((r) => ({ ...r, failedAt: r.failedAt?.toISOString() ?? null, lastAttempt: r.lastAttempt ? new Date(r.lastAttempt).toISOString() : null }))} />
    </section>
    <div className="split">
      <Card title={`ردود فاشلة (${replies.length})`}>{replies.length ? <div className="list">{replies.map((r) => <Link key={r.id} href={`/inbox?id=${r.comment_id}`} className="list-row"><span className="grow"><span className="clamp-2">{r.content}</span>{r.error && <code className="cell-meta">{r.error}</code>}</span><small className="nowrap">{riyadh(r.updated_at)}</small></Link>)}</div> : <small>لا توجد ردود فاشلة. الرد الحقيقي غير مفعّل حاليًا (COMMENTS_REPLY_UNAVAILABLE).</small>}</Card>
      <Card title={`مزامنات فاشلة (${syncs.length})`}>{syncs.length ? <div className="list">{syncs.map((s, i) => <div key={i} className="list-row"><span><code>{s.error_code ?? s.status}</code></span><small className="nowrap">{riyadh(s.started_at)}</small></div>)}</div> : <small>لا توجد مزامنات فاشلة.</small>}<Link className="btn btn-secondary btn-sm" href="/inbox">صندوق الوارد</Link></Card>
    </div>
  </AppShell>;
}
