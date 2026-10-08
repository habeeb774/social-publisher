import Link from "next/link";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, posts } from "@/db/schema";
import { approvalRequired } from "@/services/post-ops";
import { pageCan, pageSession } from "@/services/session-server";
import { allowedPageIds } from "@/services/access-scope";
import { AppShell } from "../ui/app-shell";
import { riyadh } from "../ui/api";
import { PageHeader } from "../ui/kit";
import { ReviewActions } from "./review-actions";
import { latestReviewActionQuery, returnedReviewColumn } from "@/services/review-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "مركز المراجعة" };
type Item = { id: string; content: string; scheduledAt: Date | null; campaign: string | null; creator: string | null; note: string | null; reviewAction: string | null; notes: number; updatedAt: Date };

/** Review columns come from post status and the latest recorded review decision, not ordinary notes. */
export default async function Reviews() {
  const db = getDb();
  const session = await pageSession();
  const allowed = session ? await allowedPageIds({ id: session.userId, role: session.role }) : new Set<string>();
  const scope = allowed === null ? undefined : allowed.size ? inArray(posts.pageId, Array.from(allowed)) : sql`false`;
  const latestNote = sql<string | null>`(select body from post_notes n where n.post_id = ${posts.id} order by n.created_at desc limit 1)`;
  const reviewAction = latestReviewActionQuery();
  const creator = sql<string | null>`(select metadata->>'actor' from activity_logs a where a.entity_id = ${posts.id} and a.action = 'post.created' limit 1)`;
  const noteCount = sql<number>`(select count(*)::int from post_notes n where n.post_id = ${posts.id})`;
  const select = { id: posts.id, content: posts.content, scheduledAt: posts.scheduledAt, campaign: campaigns.name, creator, note: latestNote, reviewAction, notes: noteCount, updatedAt: posts.updatedAt };
  const [pending, approved, returned, enabled, canReview] = await Promise.all([
    db.select(select).from(posts).leftJoin(campaigns, eq(posts.campaignId, campaigns.id)).where(and(eq(posts.status, "pending_approval"), isNull(posts.deletedAt), scope)).orderBy(posts.scheduledAt).limit(60),
    db.select(select).from(posts).leftJoin(campaigns, eq(posts.campaignId, campaigns.id)).where(and(inArray(posts.status, ["approved", "scheduled", "published"]), isNull(posts.deletedAt), scope, sql`exists (select 1 from activity_logs a where a.entity_id = ${posts.id} and a.action = 'post.approved' and a.created_at > now() - interval '30 days')`)).orderBy(desc(posts.updatedAt)).limit(30),
    db.select(select).from(posts).leftJoin(campaigns, eq(posts.campaignId, campaigns.id)).where(and(eq(posts.status, "draft"), isNull(posts.deletedAt), scope, sql`${reviewAction} in ('post.rejected','post.changes_requested')`)).orderBy(desc(posts.updatedAt)).limit(60),
    approvalRequired(), pageCan("content.review"),
  ]);
  const changes = returned.filter((r) => returnedReviewColumn(r.reviewAction) === "changes");
  const rejected = returned.filter((r) => returnedReviewColumn(r.reviewAction) === "rejected");
  const columns: Array<{ key: string; title: string; tone: string; items: Item[] }> = [
    { key: "pending", title: "بانتظار المراجعة", tone: "warn", items: pending },
    { key: "changes", title: "يحتاج تعديل", tone: "warn", items: changes },
    { key: "approved", title: "تمت الموافقة", tone: "ok", items: approved },
    { key: "rejected", title: "مرفوض", tone: "bad", items: rejected },
  ];
  return <AppShell title="مركز المراجعة">
    <PageHeader title="مركز المراجعة" description={enabled ? "المنشورات تمر بالمراجعة قبل الجدولة." : "سير الموافقة غير مفعّل حاليًا؛ فعّله من الإعدادات ليمر كل منشور بالمراجعة قبل جدولته."} actions={<Link className="btn btn-secondary" href="/settings/notifications">إعدادات سير العمل</Link>} />
    <div className="board">{columns.map((col) => <section key={col.key} className="board-col" aria-label={col.title}>
      <header><span className="row"><i className={`dot ${col.tone}`} />{col.title}</span><span className="badge badge-neutral">{col.items.length}</span></header>
      {!col.items.length ? <small style={{ padding: "8px 6px" }}>لا يوجد شيء هنا.</small> : col.items.map((item) => <article key={item.id} className="review-card">
        <Link href={`/posts/${item.id}`} className="clamp-2" style={{ color: "var(--heading)", WebkitLineClamp: 3 }}>{item.content}</Link>
        <small>{item.scheduledAt ? `موعد: ${riyadh(item.scheduledAt)}` : "بدون موعد"}{item.campaign && ` · ${item.campaign}`}</small>
        <small>{item.creator ?? "—"} · {item.notes} ملاحظة</small>
        {item.note && col.key !== "pending" && <small className="pre" style={{ color: "var(--text)" }}>{item.note.slice(0, 140)}</small>}
        {col.key === "pending" && canReview && <ReviewActions id={item.id} />}
      </article>)}
    </section>)}</div>
  </AppShell>;
}
