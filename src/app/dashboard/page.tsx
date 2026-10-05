import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardData } from "@/services/dashboard";
import { systemAnalytics } from "@/services/analytics";
import { currentMonth, goalsWithProgress } from "@/services/goals";
import { isPublishingEnabled } from "@/services/publishing-mode";
import { setupProgress } from "@/services/setup";
import { AppShell } from "../ui/app-shell";
import { riyadh } from "../ui/api";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icons";
import { Card, HealthRow, MetricStrip, PageHeader } from "../ui/kit";
import { SetupProgress } from "../ui/setup-progress";
import { StatusBadge } from "../ui/status-badge";

export const dynamic = "force-dynamic";
const dayLabel = (iso: string) => new Intl.DateTimeFormat("ar-SA", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const stateOf = (s: string) => s === "healthy" ? "ok" : s === "warning" ? "warn" : s === "error" ? "bad" : "off";

export default async function Dashboard() {
  const [data, analytics, goals, setup] = await Promise.all([dashboardData(), systemAnalytics(), goalsWithProgress(currentMonth()), setupProgress()]);
  if (!setup.dismissed && analytics.totals.total === 0 && !setup.complete) redirect("/onboarding");
  const live = isPublishingEnabled();
  const t = data.totals;
  const max = Math.max(1, ...data.series.map((s) => s.count));
  const next = data.upcoming[0];
  const todayDiff = t.today - t.yesterday;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Riyadh" }).format(new Date()));
  const greeting = hour < 12 ? "صباح الخير" : "مساء الخير";

  return <AppShell title="لوحة التحكم">
    <PageHeader title={`${greeting}، حبيب`} description="هذه نظرة سريعة على حالة المحتوى والنشر اليوم." actions={<><Link className="btn btn-primary" href="/posts/new"><Icon name="plus" width={16} />إنشاء منشور</Link></>} />
    {!setup.complete && !setup.dismissed && <SetupProgress steps={setup.steps} percent={setup.percent} />}
    <MetricStrip items={[
      { label: "منشورات اليوم", value: t.today, trend: { dir: todayDiff > 0 ? "up" : todayDiff < 0 ? "down" : "flat", text: `${todayDiff >= 0 ? "+" : ""}${todayDiff} عن أمس` }, spark: data.series.map((s) => s.count), href: "/posts?status=published" },
      { label: "المجدولة", value: t.scheduled, hint: `${t.scheduledToday} اليوم`, href: "/posts?status=scheduled" },
      { label: "نسبة نجاح النشر", value: data.successRate === null ? "—" : `${data.successRate}%`, hint: `آخر 30 يومًا · ${data.attempts} محاولة`, href: "/failed" },
      { label: "بانتظار الرد", value: data.commentsWaiting ?? "—", hint: data.commentsWaiting === null ? "التعليقات غير متاحة" : "تعليقات تحتاج ردًا", href: "/inbox" },
    ]} />

    <div className="dashboard-grid">
      <div className="stack">
        <Card title="نشاط النشر" action={<span className="muted" style={{ fontSize: 12 }}>آخر 14 يومًا · المنشورات المنشورة</span>}>
          <div className="activity-chart" role="img" aria-label="عدد المنشورات المنشورة يوميًا خلال آخر 14 يومًا">{data.series.map((s) => <div key={s.day} className="activity-bar" title={`${dayLabel(s.day)}: ${s.count}`}><i style={{ height: `${Math.max(4, (s.count / max) * 100)}%` }} className={s.count ? "" : "zero"} /><small>{Number(s.day.slice(8))}</small></div>)}</div>
        </Card>
        <Card title="المنشورات القادمة" action={<Link href="/calendar">التقويم</Link>} flush>
          {data.upcoming.length ? <div className="list" style={{ padding: "0 20px 8px" }}>{data.upcoming.map((p) => <Link key={p.id} href={`/posts/${p.id}`} className="list-row upcoming-row"><span className="post-cell">{p.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="thumb" src={p.image} alt="" loading="lazy" /> : <span className="thumb"><Icon name="posts" width={16} /></span>}<span className="grow"><span className="clamp-2" style={{ color: "var(--heading)" }}>{p.content}</span><span className="cell-meta">{p.page ?? "—"}</span></span></span><span className="nowrap muted num">{riyadh(p.scheduledAt)}</span></Link>)}</div> : <EmptyState icon="calendar" title="لا توجد منشورات مجدولة" description="أضف منشورًا إلى الطابور أو جدوله بموعد." action={<Link className="btn btn-primary btn-sm" href="/posts/new">إنشاء منشور</Link>} />}
        </Card>
        <div className="split">
          <Card title="تعليقات بحاجة رد" action={<Link href="/inbox">صندوق الوارد</Link>}>
            {data.comments.length ? <div className="list">{data.comments.map((c) => <Link key={c.id} href={`/inbox?id=${c.id}`} className="list-row"><span className="grow"><b style={{ color: "var(--heading)", fontWeight: 500 }}>{c.author_name ?? "متابع"}</b><span className="clamp-2 muted">{c.message}</span></span><small className="nowrap">{riyadh(c.created_time, "time")}</small></Link>)}</div> : <EmptyState icon="inbox" title={data.commentsWaiting === null ? "مزامنة التعليقات غير مفعّلة" : "لا توجد تعليقات بانتظار الرد"} description={data.commentsWaiting === null ? "راجع التكاملات لتفعيل قراءة التعليقات." : undefined} />}
          </Card>
          <Card title="آخر النشاطات" action={<Link href="/logs">السجلات</Link>}>
            {data.activity.length ? <ul className="timeline">{data.activity.map((a) => <li key={a.id}><div className="row-between"><span>{a.label}{a.entityType === "post" && a.entityId && <> · <Link href={`/posts/${a.entityId}`}>المنشور</Link></>}</span><time>{riyadh(a.at, "time")}</time></div><small>{a.actor}</small></li>)}</ul> : <EmptyState icon="logs" title="لا توجد نشاطات بعد" />}
          </Card>
        </div>
      </div>

      <div className="stack">
        <Card title="المنشور القادم" action={next && <StatusBadge status={next.status} />}>
          {next ? <div className="stack" style={{ gap: 10 }}>
            <div className="next-time"><Icon name="clock" width={16} /><b className="num">{riyadh(next.scheduledAt)}</b></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {next.image && <img className="preview-image" src={next.image} alt="" style={{ maxHeight: 180 }} />}
            <p className="clamp-2 pre" style={{ WebkitLineClamp: 5, color: "var(--heading)" }}>{next.content}</p>
            <div className="form-actions"><Link className="btn btn-secondary btn-sm" href={`/posts/${next.id}`}>التفاصيل</Link><Link className="btn btn-ghost btn-sm" href={`/posts/${next.id}/edit`}>تعديل</Link></div>
          </div> : <EmptyState icon="clock" title="لا يوجد منشور قادم" />}
        </Card>
        <Card title="صحة النظام" action={<Link href="/status">التفاصيل</Link>}>
          <div className="health-list">
            {data.health.checks.map((c) => <HealthRow key={c.key} label={c.label} state={stateOf(c.state)} value={c.detail} />)}
            <HealthRow label="مزامنة التعليقات" state={data.commentsSync === undefined ? "off" : !data.commentsSync ? "off" : data.commentsSync.status === "success" ? "ok" : "warn"} value={data.commentsSync === undefined ? "غير مُعدة" : !data.commentsSync ? "لم تعمل بعد" : data.commentsSync.error_code ?? data.commentsSync.status} />
            <HealthRow label="وضع النشر" state={live ? "ok" : "warn"} value={live ? "النشر الحقيقي مفعّل" : "وضع الاختبار"} />
          </div>
        </Card>
        {(t.pending > 0 || t.failed > 0) && <Card title="يحتاج انتباهك"><div className="list">{t.pending > 0 && <Link className="list-row" href="/reviews"><span><i className="dot warn" /> {t.pending} منشور بانتظار الموافقة</span><Icon name="chevron" width={14} style={{ transform: "scaleX(-1)" }} /></Link>}{t.failed > 0 && <Link className="list-row" href="/failed"><span><i className="dot bad" /> {t.failed} منشور فشل نشره</span><Icon name="chevron" width={14} style={{ transform: "scaleX(-1)" }} /></Link>}</div></Card>}
        {goals.length > 0 && <Card title="أهداف الشهر" action={<Link href="/goals">الأهداف</Link>}>{goals.map((g) => <div key={g.id} className="goal-row"><div className="row-between"><span>{g.category ?? "كل المنشورات"}</span><small className="num">{g.published}/{g.target}</small></div><div className="progress"><span style={{ width: `${g.percent}%` }} /></div></div>)}</Card>}
      </div>
    </div>
  </AppShell>;
}
