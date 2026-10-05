import { Suspense } from "react";
import { bestTimeFromEngagement, insightsFrom, systemAnalytics } from "@/services/analytics";
import { AppShell } from "../ui/app-shell";

export const dynamic = "force-dynamic";

function Bars({ title, rows, empty }: { title: string; rows: Array<{ label: string; count: number }>; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return <section className="card"><h2>{title}</h2>{!rows.length ? <p>{empty}</p> : <ul className="bar-list">{rows.map((r) => <li key={r.label}><span>{r.label}</span><span className="bar"><i style={{ width: `${(r.count / max) * 100}%` }} /></span><b>{r.count}</b></li>)}</ul>}</section>;
}

/** Facebook engagement section streams in separately so the system stats render immediately. */
async function Engagement() {
  const result = await bestTimeFromEngagement();
  const totals = new Map<string, { label: string; value: number }>();
  for (const { perf } of result.posts) for (const m of perf.metrics) { const t = totals.get(m.key) ?? { label: m.label, value: 0 }; t.value += m.value; totals.set(m.key, t); }
  return <section className="card"><h2>أداء Facebook (آخر {result.samples} منشورًا ببيانات متاحة)</h2>
    {!totals.size ? <p>لا تتوفر بيانات أداء من Facebook بعد. تظهر بعد نشر منشورات وتفاعل الجمهور معها.</p> : <div className="metrics-row compact">{[...totals.entries()].filter(([k]) => !k.includes(".")).map(([k, t]) => <div className="metric" key={k}><small>{t.label}</small><strong>{t.value.toLocaleString("ar-SA")}</strong></div>)}</div>}
    <h3>أفضل وقت للنشر</h3>
    {result.recommendation ? <p><strong>{result.recommendation.label}</strong> · متوسط تفاعل {result.recommendation.avgEngagement} (من {result.recommendation.basedOn} منشور في هذا الوقت)</p> : <p>لا توجد بيانات تفاعل كافية بعد (نحتاج 5 منشورات على الأقل ببيانات أداء؛ المتوفر {result.samples}). لن نعرض توصية تقديرية.</p>}
    <small>المصدر: Facebook Graph API. تُعرض فقط الحقول التي يرجعها Facebook فعلًا، وتُحدّث كل 30 دقيقة.</small>
  </section>;
}

export default async function Analytics() {
  const a = await systemAnalytics();
  const insights = insightsFrom(a);
  return <AppShell title="التحليلات">
    <div className="page-intro"><div><h2>التحليلات</h2><p>أرقام النظام الفعلية وأداء منشوراتك على Facebook.</p></div></div>
    {insights.length > 0 && <section className="insights">{insights.map((line) => <p key={line} className="insight">💡 {line}</p>)}</section>}
    <section className="metrics-row"><div className="metric"><small>كل المنشورات</small><strong>{a.totals.total}</strong></div><div className="metric"><small>المنشورة</small><strong>{a.totals.published}</strong></div><div className="metric"><small>المجدولة</small><strong>{a.totals.scheduled}</strong></div><div className="metric"><small>الفاشلة</small><strong>{a.totals.failed}</strong></div><div className="metric"><small>نسبة نجاح النشر</small><strong>{a.successRate === null ? "—" : `${a.successRate}%`}</strong></div></section>
    <div className="dashboard-grid">
      <Bars title="أيام النشر الأكثر" rows={a.byDay} empty="لا توجد منشورات منشورة بعد." />
      <Bars title="ساعات النشر الأكثر" rows={a.byHour} empty="لا توجد منشورات منشورة بعد." />
      <Bars title="المنشورات لكل صفحة" rows={a.byPage.map((p) => ({ label: p.name, count: p.n }))} empty="لا توجد صفحات." />
    </div>
    <Suspense fallback={<section className="card"><h2>أداء Facebook</h2><p>جارٍ جلب البيانات من Facebook…</p></section>}><Engagement /></Suspense>
  </AppShell>;
}
