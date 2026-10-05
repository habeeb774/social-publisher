import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLogs, campaigns, facebookPages, postMedia, posts, publicationAttempts } from "@/db/schema";
import { auditLabel } from "@/services/audit-labels";
import { classifyError } from "@/services/error-classes";
import { approvalRequired } from "@/services/post-ops";
import { pageCan } from "@/services/session-server";
import { AppShell } from "../../ui/app-shell";
import { riyadh } from "../../ui/api";
import { Icon } from "../../ui/icons";
import { StatusBadge } from "../../ui/status-badge";
import { InternalNotes, PostActions, PostPerformance, RetryButton, VersionHistory } from "./post-panels";
import { RecurrencePanel } from "./recurrence-panel";

export const dynamic = "force-dynamic";
const time = (d: Date) => new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d);
const dateOnly = (d: Date) => new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium" }).format(d);
const ATTEMPT: Record<string, [string, "ok" | "bad" | "warn" | ""]> = { started: ["بدأ عامل النشر (Claim)", "warn"], success: ["تم النشر على Facebook", "ok"], DRY_RUN_SUCCESS: ["اختبار آمن ناجح — لم يُنشر فعليًا", "ok"], failed: ["فشل النشر", "bad"], outcome_unknown: ["نتيجة غير مؤكدة — لم تُعد المحاولة تلقائيًا", "warn"] };

export default async function PostDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const db = getDb();
  const [row] = await db.select({ post: posts, page: facebookPages, campaign: campaigns.name }).from(posts).innerJoin(facebookPages, eq(posts.pageId, facebookPages.id)).leftJoin(campaigns, eq(posts.campaignId, campaigns.id)).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!row) notFound();
  const [attempts, media, audit, approval, canWrite, canPublish] = await Promise.all([
    db.select().from(publicationAttempts).where(eq(publicationAttempts.postId, id)).orderBy(desc(publicationAttempts.startedAt)).limit(20),
    db.select().from(postMedia).where(eq(postMedia.postId, id)),
    db.select().from(activityLogs).where(eq(activityLogs.entityId, id)).orderBy(asc(activityLogs.createdAt)).limit(40),
    approvalRequired(), pageCan("content.write"), pageCan("content.publish"),
  ]);
  const { post, page, campaign } = row;
  const editable = ["draft", "scheduled", "pending_approval", "approved"].includes(post.status);
  const kind = post.status === "failed" ? classifyError(post.lastError) : null;
  const errorCode = post.lastError?.match(/^([A-Z_]+)/)?.[1] ?? null;
  // One chronological timeline: audit events + worker attempts (start and finish).
  const events = [
    { at: post.createdAt, label: "إنشاء المنشور", tone: "" as const, detail: undefined as string | undefined },
    ...audit.filter((a) => a.action !== "post.created").map((a) => ({ at: a.createdAt, label: auditLabel(a.action), tone: "" as const, detail: String((a.metadata as Record<string, unknown> | null)?.actor ?? "") || undefined })),
    ...attempts.flatMap((a) => [
      { at: a.startedAt, label: `المحاولة ${a.attemptNumber}: بدأ عامل النشر`, tone: "warn" as const, detail: a.provider === "facebook_graph" ? "Facebook Graph" : a.provider === "facebook_mcp" ? "Windsor MCP" : a.provider },
      ...(a.finishedAt ? [{ at: a.finishedAt, label: ATTEMPT[a.status]?.[0] ?? a.status, tone: (ATTEMPT[a.status]?.[1] ?? "") as "ok" | "bad" | "warn" | "", detail: a.errorMessage ?? (a.facebookPostId ? `Facebook ID: ${a.facebookPostId}` : undefined) }] : []),
    ]),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return <AppShell title="تفاصيل المنشور" parent={{ label: "المنشورات", href: "/posts" }}>
    <div className="page-header"><div><h1 className="clamp-2" style={{ maxWidth: 760 }}>{post.content.split("\n")[0].slice(0, 90) || "منشور"}</h1><p>آخر تحديث {riyadh(post.updatedAt)}</p></div>
      <div className="page-actions">{canWrite && editable && <Link className="btn btn-primary" href={`/posts/${id}/edit`}><Icon name="edit" width={15} />تعديل</Link>}{post.facebookPermalink && /^https:\/\/(www\.)?facebook\.com\//i.test(post.facebookPermalink) && <a className="btn btn-secondary" href={post.facebookPermalink} target="_blank" rel="noopener noreferrer"><Icon name="facebook" width={15} />عرض على Facebook</a>}</div></div>

    <div className="detail-meta">
      <span><b>الحالة</b><StatusBadge status={post.status} /></span>
      <span><b>رقم المنشور</b><code title={id}>{id.slice(0, 8)}</code></span>
      <span><b>الصفحة</b>{page.name}</span>
      <span><b>الحملة</b>{campaign ? <Link href={`/campaigns/${post.campaignId}`}>{campaign}</Link> : "—"}</span>
      <span><b>موعد النشر</b><span className="num">{riyadh(post.scheduledAt)}</span></span>
      <span><b>نُشر في</b><span className="num">{riyadh(post.publishedAt)}</span></span>
    </div>
    {canWrite && <PostActions id={id} status={post.status} approvalRequired={approval} />}

    {kind && <div className="alert alert-danger" role="alert" style={{ display: "grid", gap: 8 }}>
      <div className="row-between"><strong>{kind.label}{errorCode && <code style={{ marginInlineStart: 8 }}>{errorCode}</code>}</strong>{canPublish && <RetryButton id={id} retryable={kind.retryable} uncertain={kind.key === "uncertain"} />}</div>
      <span>{kind.hint}</span>
      <details className="disclosure"><summary>التفاصيل التقنية</summary><code className="error-detail">{post.lastError}</code></details>
    </div>}

    <div className="detail-layout">
      <section className="stack">
        <article className="fb-preview">
          <div className="fb-head"><span className="fb-avatar">{page.name.replace(/^م\.\s*/, "").slice(0, 1)}</span><div><div className="fb-name">{page.name}</div><div className="fb-time">{riyadh(post.publishedAt ?? post.scheduledAt)} · 🌐</div></div></div>
          <div className="fb-text">{post.content}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {media.filter((m) => /^https:\/\//i.test(m.url)).map((m) => <img key={m.id} className="fb-image" src={m.url} alt="صورة المنشور" loading="lazy" />)}
          <div className="fb-actions"><span>👍 أعجبني</span><span>💬 تعليق</span><span>↗ مشاركة</span></div>
        </article>
        {(post.category || post.tags.length > 0) && <div className="chips">{post.category && <span className="chip">{post.category}</span>}{post.tags.map((t) => <span key={t} className="chip muted">#{t}</span>)}</div>}
        {post.status === "published" && <PostPerformance id={id} />}
      </section>
      <aside className="stack">
        <section className="card"><div className="card-header"><h2>سجل النشر</h2><small>{attempts.length} محاولة</small></div>
          <ol className="timeline">{events.map((e, i) => <li key={i} className={e.tone}><div className="row-between"><span style={{ color: "var(--heading)" }}>{e.label}</span><time title={dateOnly(e.at)}>{time(e.at)}</time></div>{e.detail && <small className="pre">{e.detail.slice(0, 220)}</small>}</li>)}</ol>
          {attempts.some((a) => a.status === "DRY_RUN_SUCCESS") && post.status === "draft" && <small>أُعيد المنشور إلى مسودة بعد الاختبار الآمن لمنع تكرار الاختبار تلقائيًا.</small>}
        </section>
        {canWrite && post.status !== "published" && !post.recurrenceId && <RecurrencePanel id={id} />}
      </aside>
    </div>
    <div className="split" style={{ marginTop: 16 }}><VersionHistory id={id} editable={canWrite && editable} /><InternalNotes id={id} /></div>
  </AppShell>;
}
