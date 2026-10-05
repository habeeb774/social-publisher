import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { systemAnalytics } from "@/services/analytics";
import { pageCan } from "@/services/session-server";
import { AppShell } from "../ui/app-shell";
import { Card, MetricStrip, PageHeader } from "../ui/kit";
import { Icon } from "../ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "التقارير" };
type Row = Record<string, unknown>;
const q = async (query: ReturnType<typeof sql>) => (await getDb().execute(query).catch(() => ({ rows: [] as Row[] }))).rows as Row[];

/** Business reports from real data only: publishing, campaigns, comments, system. */
export default async function Reports() {
  const [a, campaigns, comments, system, canExport] = await Promise.all([
    systemAnalytics(),
    q(sql`select c.name, c.status, count(p.id)::int as total, count(p.id) filter (where p.status='published')::int as published, count(p.id) filter (where p.status='scheduled')::int as scheduled, count(p.id) filter (where p.status='failed')::int as failed from campaigns c left join posts p on p.campaign_id=c.id and p.deleted_at is null group by c.id order by total desc limit 20`),
    q(sql`select count(*)::int as total, count(*) filter (where status='replied')::int as replied, count(*) filter (where needs_reply and status not in ('spam','hidden','resolved','replied'))::int as waiting, count(*) filter (where created_time > now() - interval '7 days')::int as week from facebook_comments`),
    q(sql`select count(*)::int as runs, count(*) filter (where status<>'success')::int as failed, round(avg(duration_ms))::int as avg_ms, max(triggered_at) as last from scheduler_runs where triggered_at > now() - interval '7 days'`),
    pageCan("data.export"),
  ]);
  const c = comments[0] ?? {}, s = system[0] ?? {};
  const replyRate = Number(c.total) ? Math.round((Number(c.replied) / Number(c.total)) * 100) : null;
  const exports: Array<[string, string]> = [["posts", "المنشورات CSV"], ["attempts", "محاولات النشر CSV"], ["analytics", "التحليلات CSV"], ["activity", "سجل العمليات CSV"], ["backup", "نسخة احتياطية JSON"]];

  return <AppShell title="التقارير">
    <PageHeader title="التقارير" description="ملخصات النشر والحملات والتعليقات وصحة النظام من البيانات الفعلية." actions={canExport ? <Link className="btn btn-secondary" href="/settings/export"><Icon name="import" width={15} style={{ transform: "rotate(180deg)" }} />كل خيارات التصدير</Link> : undefined} />
    <h2 className="section-title" style={{ margin: "4px 0 8px" }}>النشر</h2>
    <MetricStrip items={[{ label: "كل المنشورات", value: a.totals.total }, { label: "المنشورة", value: a.totals.published }, { label: "نُشر هذا الأسبوع", value: a.totals.thisWeek, hint: `الأسبوع الماضي: ${a.totals.lastWeek}` }, { label: "نسبة النجاح", value: a.successRate === null ? "—" : `${a.successRate}%`, hint: `${a.attemptsTotal} محاولة` }, { label: "الفاشلة", value: a.totals.failed }]} />
    <div className="split">
      <Card title="الحملات">{campaigns.length ? <div className="responsive-table"><table className="data-table"><thead><tr><th>الحملة</th><th>الكل</th><th>منشور</th><th>مجدول</th><th>فشل</th></tr></thead><tbody>{campaigns.map((r, i) => <tr key={i}><td>{String(r.name)}</td><td className="num">{String(r.total)}</td><td className="num">{String(r.published)}</td><td className="num">{String(r.scheduled)}</td><td className="num">{String(r.failed)}</td></tr>)}</tbody></table></div> : <small>لا توجد حملات بعد.</small>}</Card>
      <Card title="التعليقات" action={<Link href="/analytics/comments">التفاصيل</Link>}>{c.total === undefined ? <small>جداول التعليقات غير متاحة.</small> : <div className="list">
        <div className="list-row"><span>كل التعليقات</span><b className="num">{String(c.total)}</b></div>
        <div className="list-row"><span>خلال 7 أيام</span><b className="num">{String(c.week)}</b></div>
        <div className="list-row"><span>بانتظار الرد</span><b className="num">{String(c.waiting)}</b></div>
        <div className="list-row"><span>نسبة الرد</span><b className="num">{replyRate === null ? "—" : `${replyRate}%`}</b></div>
      </div>}</Card>
    </div>
    <div className="split" style={{ marginTop: 16 }}>
      <Card title="النظام (آخر 7 أيام)"><div className="list">
        <div className="list-row"><span>تشغيلات عامل النشر</span><b className="num">{String(s.runs ?? 0)}</b></div>
        <div className="list-row"><span>تشغيلات فاشلة</span><b className="num">{String(s.failed ?? 0)}</b></div>
        <div className="list-row"><span>متوسط مدة التشغيل</span><b className="num">{s.avg_ms ? `${s.avg_ms} ms` : "—"}</b></div>
      </div></Card>
      {canExport && <Card title="تصدير"><div className="list">{exports.map(([k, l]) => <a key={k} className="list-row" href={`/api/export/${k}`} download><span>{l}</span><Icon name="import" width={15} /></a>)}</div><small>لا تتضمن الملفات أي توكن أو كلمة مرور.</small></Card>}
    </div>
  </AppShell>;
}
