import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLogs, publicationAttempts, schedulerRuns } from "@/db/schema";
import { auditLabel } from "@/services/audit-labels";
import { AppShell } from "../ui/app-shell";

export const dynamic = "force-dynamic";
const formatDate=(date:Date)=>date.toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"});
export default async function LogsPage() {
  const db=getDb();
  const [attempts,runs,audit]=await Promise.all([
    db.select({id:publicationAttempts.id,postId:publicationAttempts.postId,number:publicationAttempts.attemptNumber,status:publicationAttempts.status,createdAt:publicationAttempts.createdAt}).from(publicationAttempts).orderBy(desc(publicationAttempts.createdAt)).limit(100),
    db.select({id:schedulerRuns.id,triggeredAt:schedulerRuns.triggeredAt,status:schedulerRuns.status,processed:schedulerRuns.processedCount,published:schedulerRuns.publishedCount,failed:schedulerRuns.failedCount}).from(schedulerRuns).orderBy(desc(schedulerRuns.triggeredAt)).limit(100),
    db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(100),
  ]);
  return <AppShell title="السجلات" eyebrow="المراقبة"><h1>سجل تنفيذ النشر</h1><p>آخر 100 محاولة وآخر 100 تشغيل للعامل، بتوقيت الرياض. لا تُعرض استجابات المزود الخام أو الأسرار.</p>
    <section className="panel-card log-card"><div className="row-between"><h2>سجل العمليات</h2><a href="/api/export/activity">تصدير CSV</a></div><p>من أنشأ، عدّل، جدول، ألغى، ووافق — آخر 100 عملية.</p>{!audit.length?<p>لا توجد عمليات مسجلة.</p>:<ul className="timeline-list">{audit.map(a=>{const m=(a.metadata??{}) as Record<string,unknown>;return <li key={a.id}><span><b>{auditLabel(a.action)}</b>{a.entityType==="post"&&a.entityId?<> · <Link href={`/posts/${a.entityId}`}>المنشور</Link></>:null}</span><small>{formatDate(a.createdAt)} · {String(m.actor??"النظام")}</small></li>})}</ul>}</section>
    <section className="panel-card log-card"><h2>محاولات النشر</h2>{!attempts.length?<p>لا توجد محاولات مسجلة.</p>:<div style={{overflowX:"auto"}}><table className="posts-table"><thead><tr><th>المنشور</th><th>المحاولة</th><th>النتيجة</th><th>التاريخ</th></tr></thead><tbody>{attempts.map(item=><tr key={item.id}><td><Link href={`/posts/${item.postId}`}>{item.postId}</Link></td><td>{item.number}</td><td>{item.status==="DRY_RUN_SUCCESS"?"اختبار آمن ناجح — لم يُنشر فعليًا":item.status}</td><td>{formatDate(item.createdAt)}</td></tr>)}</tbody></table></div>}</section>
    <section className="panel-card log-card"><h2>تشغيل Scheduler</h2>{!runs.length?<p>لا توجد استدعاءات موثقة.</p>:<div style={{overflowX:"auto"}}><table className="posts-table"><thead><tr><th>التاريخ</th><th>الحالة</th><th>معالجة</th><th>نُشر فعليًا</th><th>فشل</th></tr></thead><tbody>{runs.map(item=><tr key={item.id}><td>{formatDate(item.triggeredAt)}</td><td>{item.status}</td><td>{item.processed}</td><td>{item.published}</td><td>{item.failed}</td></tr>)}</tbody></table></div>}</section>
  </AppShell>;
}
