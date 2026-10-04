import Link from "next/link";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, publicationAttempts, schedulerRuns } from "@/db/schema";
import { isPublishingEnabled } from "@/services/publishing-mode";
import { AppShell } from "../ui/app-shell";
export const dynamic="force-dynamic";
export default async function Dashboard() {
  const db=getDb();
  const [counts,next,attempts,runs]=await Promise.all([
    db.select({scheduled:sql<number>`count(*) filter (where ${posts.status}='scheduled')::int`,failed:sql<number>`count(*) filter (where ${posts.status}='failed')::int`,publishedToday:sql<number>`count(*) filter (where ${posts.status}='published' and (${posts.publishedAt} at time zone 'Asia/Riyadh')::date=(now() at time zone 'Asia/Riyadh')::date)::int`,published:sql<number>`count(*) filter (where ${posts.status}='published')::int`}).from(posts).where(isNull(posts.deletedAt)),
    db.select().from(posts).where(and(eq(posts.status,"scheduled"),isNull(posts.deletedAt))).orderBy(asc(posts.scheduledAt)).limit(1),
    db.select({id:publicationAttempts.id,postId:publicationAttempts.postId,status:publicationAttempts.status,createdAt:publicationAttempts.createdAt}).from(publicationAttempts).orderBy(desc(publicationAttempts.createdAt)).limit(6),
    db.select({status:schedulerRuns.status,triggeredAt:schedulerRuns.triggeredAt,recent:sql<boolean>`${schedulerRuns.triggeredAt} > now() - interval '15 minutes'`}).from(schedulerRuns).orderBy(desc(schedulerRuns.triggeredAt)).limit(1),
  ]);
  const stats=counts[0];
  const live=isPublishingEnabled();
  const run=runs[0];
  return <AppShell title="لوحة التحكم"><div className="welcome-row"><div><h1>مرحبًا، حبيب</h1><p>حالة المحتوى والتنفيذ من قاعدة البيانات.</p></div><Link className="primary-button" href="/posts/new">إنشاء منشور</Link></div>
    <div className="dashboard-alert">{live?"النشر الحقيقي مفعّل؛ تنفيذ المواعيد يعتمد على وصول طلبات الجدولة.":"وضع الاختبار مفعّل؛ لا يُنشر المحتوى فعليًا."}</div>
    <section className="metrics-row"><div className="metric"><small>المجدولة</small><strong>{stats.scheduled}</strong></div><div className="metric"><small>المنشورة اليوم</small><strong>{stats.publishedToday}</strong></div><div className="metric"><small>إجمالي المنشورة</small><strong>{stats.published}</strong></div><div className="metric"><small>الفاشلة</small><strong>{stats.failed}</strong></div></section>
    <section className="dashboard-grid"><div className="panel-card"><div className="panel-heading"><h2>المنشور القادم</h2><Link href="/calendar">التقويم</Link></div>{next[0]?<div><p style={{whiteSpace:"pre-wrap"}}>{next[0].content}</p><p>{next[0].scheduledAt?.toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"})}</p><Link href={`/posts/${next[0].id}`}>عرض التفاصيل</Link></div>:<div className="empty-state"><strong>لا توجد منشورات مجدولة</strong><Link href="/posts/new">إنشاء منشور</Link></div>}</div>
      <div className="panel-card"><h2>حالة الجدولة</h2><p>{run?.recent&&run.status==="success"?"وصل استدعاء ناجح خلال آخر 15 دقيقة":"لا يوجد تشغيل ناجح حديث؛ تحقق من خدمة الجدولة."}</p><p>آخر استدعاء: {run?run.triggeredAt.toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"}):"لا يوجد"}</p><Link href="/settings/integrations">فحص التكاملات</Link></div>
    </section><section className="panel-card"><div className="panel-heading"><h2>آخر محاولات النشر</h2><Link href="/logs">كل السجلات</Link></div>{attempts.length?attempts.map(attempt=><div className="integration-row" key={attempt.id}><Link href={`/posts/${attempt.postId}`}>{attempt.status==="DRY_RUN_SUCCESS"?"اختبار آمن ناجح":attempt.status}</Link><time>{attempt.createdAt.toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"})}</time></div>):<p>لم تُسجل محاولات نشر.</p>}</section>
  </AppShell>;
}
