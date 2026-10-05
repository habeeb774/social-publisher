import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, postMedia, posts, publicationAttempts } from "@/db/schema";
import { AppShell } from "../../ui/app-shell";
import { StatusBadge } from "../../ui/status-badge";
import { STATUS_LABELS as labels } from "../../ui/api";
import { approvalRequired } from "@/services/post-ops";
import { InternalNotes, PostActions, PostPerformance, VersionHistory } from "./post-panels";
import { RecurrencePanel } from "./recurrence-panel";

export const dynamic = "force-dynamic";
function formatDate(value: Date | null) {
  return value ? value.toLocaleString("ar-SA", {timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"}) : "غير محدد";
}
export default async function PostDetails({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const db=getDb();
  const [row]=await db.select({post:posts,page:facebookPages}).from(posts).innerJoin(facebookPages,eq(posts.pageId,facebookPages.id)).where(and(eq(posts.id,id),isNull(posts.deletedAt))).limit(1);
  if(!row) notFound();
  const [attempts,media,approval]=await Promise.all([
    db.select({id:publicationAttempts.id,number:publicationAttempts.attemptNumber,status:publicationAttempts.status,startedAt:publicationAttempts.startedAt,finishedAt:publicationAttempts.finishedAt,error:publicationAttempts.errorMessage}).from(publicationAttempts).where(eq(publicationAttempts.postId,id)).orderBy(desc(publicationAttempts.startedAt)),
    db.select().from(postMedia).where(eq(postMedia.postId,id)),
    approvalRequired(),
  ]);
  const {post,page}=row;
  return <AppShell title="تفاصيل المنشور" eyebrow="المنشورات">
    <div className="detail-top"><div><h1>تفاصيل المنشور</h1><p>المحتوى وسجل التنفيذ الفعلي بتوقيت الرياض.</p></div>{["draft","scheduled","pending_approval","approved"].includes(post.status)&&<Link className="primary-button" href={`/posts/${id}/edit`}>تعديل المنشور</Link>}<Link className="secondary-button" href="/posts">العودة للمنشورات</Link></div>
    <div className="detail-meta"><span><b>الحالة</b><StatusBadge tone={post.status==="published"?"success":post.status==="failed"?"danger":"neutral"}>{labels[post.status]}</StatusBadge></span><span><b>معرّف المنشور</b><code>{id}</code></span><span><b>الصفحة</b>{page.name}</span><span><b>موعد النشر</b>{formatDate(post.scheduledAt)}</span></div>
    <PostActions id={id} status={post.status} approvalRequired={approval}/>
    <div className="detail-layout"><section className="panel-card detail-preview"><h2>معاينة المحتوى</h2><div className="social-preview"><div className="preview-account"><span>f</span><strong>{page.name}</strong></div><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{post.content}</p>
      {media.length?media.map(item=>/^https:\/\//i.test(item.url)?/* eslint-disable-next-line @next/next/no-img-element */<img key={item.id} className="preview-image" src={item.url} alt="صورة المنشور" loading="lazy"/>:null):<div className="preview-placeholder">لا توجد مرفقات</div>}
      {post.facebookPostId && <p>معرّف Facebook: <code>{post.facebookPostId}</code></p>}
      {post.facebookPermalink && /^https:\/\/(www\.)?facebook\.com\//i.test(post.facebookPermalink) && <a href={post.facebookPermalink} target="_blank" rel="noopener noreferrer">عرض المنشور على Facebook</a>}
      {post.lastError && <p className="banner">{post.lastError}</p>}
    </div></section><aside className="panel-card publication-timeline"><h2>محاولات النشر</h2>
      {!attempts.length && <p>لم تُسجل محاولات نشر بعد.</p>}
      {attempts.map(attempt=><div key={attempt.id} className="attempt"><div><strong>المحاولة {attempt.number} · {attempt.status==="DRY_RUN_SUCCESS"?"اختبار آمن ناجح — لم يُنشر فعليًا":attempt.status}</strong><small>{formatDate(attempt.startedAt)}</small>{attempt.error && <p>{attempt.error}</p>}</div></div>)}
      {attempts.some(attempt=>attempt.status==="DRY_RUN_SUCCESS") && post.status==="draft" && <p>أُعيد المنشور إلى مسودة بعد الاختبار الآمن لمنع تكرار الاختبار تلقائيًا.</p>}
    </aside></div>
    <div className="detail-layout">{post.status==="published"&&<PostPerformance id={id}/>}{post.status!=="published"&&!post.recurrenceId&&<RecurrencePanel id={id}/>}<VersionHistory id={id} editable={["draft","scheduled","pending_approval","approved"].includes(post.status)}/><InternalNotes id={id}/></div>
  </AppShell>;
}
