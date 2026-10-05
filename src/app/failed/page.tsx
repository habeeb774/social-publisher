import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, publicationAttempts } from "@/db/schema";
import { classifyError } from "@/services/error-classes";
import { pageCan } from "@/services/session-server";
import { AppShell } from "../ui/app-shell";
import { riyadh } from "../ui/api";
import { Card, PageHeader } from "../ui/kit";
import { FailedClient } from "./failed-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "مركز الفشل" };
type Reply = { id: string; comment_id: string; content: string; error: string | null; updated_at: string };
type Sync = { status: string; error_code: string | null; started_at: string };

export default async function Failed() {
  const db = getDb();
  const [rows, replies, syncs, canRetry] = await Promise.all([
    db.select({ id: posts.id, content: posts.content, lastError: posts.lastError, failedAt: posts.failedAt, attempts: sql<number>`count(${publicationAttempts.id})::int`, lastAttempt: sql<Date | null>`max(${publicationAttempts.startedAt})` })
      .from(posts).leftJoin(publicationAttempts, eq(publicationAttempts.postId, posts.id)).where(and(eq(posts.status, "failed"), isNull(posts.deletedAt))).groupBy(posts.id).orderBy(desc(posts.failedAt)).limit(100),
    db.execute(sql`select id, comment_id, content, coalesce(error_code, error_message) as error, updated_at from comment_replies where status = 'failed' order by updated_at desc limit 50`).then((r) => r.rows as Reply[]).catch(() => db.execute(sql`select id, comment_id, content, null as error, updated_at from comment_replies where status = 'failed' order by updated_at desc limit 50`).then((r) => r.rows as Reply[]).catch(() => [] as Reply[])),
    db.execute(sql`select status, error_code, started_at from comments_sync_runs where status not in ('success','completed') order by started_at desc limit 20`).then((r) => r.rows as Sync[]).catch(() => [] as Sync[]),
    pageCan("content.publish"),
  ]);
  return <AppShell title="مركز الفشل">
    <PageHeader title="مركز الفشل" description="كل ما فشل في مكان واحد، مصنفًا بلغة واضحة. إعادة المحاولة للأخطاء المؤقتة فقط." />
    <section className="card card-flush" style={{ marginBottom: 16 }}><div className="card-header" style={{ padding: "16px 20px 8px" }}><h2>منشورات فاشلة</h2><small>{rows.length}</small></div>
      <FailedClient canRetry={canRetry} rows={rows.map((r) => ({ ...r, failedAt: r.failedAt?.toISOString() ?? null, lastAttempt: r.lastAttempt ? new Date(r.lastAttempt).toISOString() : null, kind: classifyError(r.lastError) }))} />
    </section>
    <div className="split">
      <Card title={`ردود فاشلة (${replies.length})`}>{replies.length ? <div className="list">{replies.map((r) => <Link key={r.id} href={`/inbox?id=${r.comment_id}`} className="list-row"><span className="grow"><span className="clamp-2">{r.content}</span>{r.error && <code className="cell-meta">{r.error}</code>}</span><small className="nowrap">{riyadh(r.updated_at)}</small></Link>)}</div> : <small>لا توجد ردود فاشلة. الرد الحقيقي غير مفعّل حاليًا (COMMENTS_REPLY_UNAVAILABLE).</small>}</Card>
      <Card title={`مزامنات فاشلة (${syncs.length})`}>{syncs.length ? <div className="list">{syncs.map((s, i) => <div key={i} className="list-row"><span><code>{s.error_code ?? s.status}</code></span><small className="nowrap">{riyadh(s.started_at)}</small></div>)}</div> : <small>لا توجد مزامنات فاشلة.</small>}<Link className="btn btn-secondary btn-sm" href="/inbox">صندوق الوارد</Link></Card>
    </div>
  </AppShell>;
}
