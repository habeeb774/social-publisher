import { Suspense } from "react";
import { bestTimeFromEngagement, insightsFrom, systemAnalytics } from "@/services/analytics";
import { AppShell } from "../ui/app-shell";
import { pageSession } from "@/services/session-server";
import { allowedPageIds } from "@/services/access-scope";
import {reachGoal,REACH_LABELS,type ReachState} from '@/services/reach-goal';

export const dynamic = "force-dynamic";

function Bars({ title, rows, empty }: { title: string; rows: Array<{ label: string; count: number }>; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return <section className="card"><h2>{title}</h2>{!rows.length ? <p>{empty}</p> : <ul className="bar-list">{rows.map((r) => <li key={r.label}><span>{r.label}</span><span className="bar"><i style={{ width: `${(r.count / max) * 100}%` }} /></span><b>{r.count}</b></li>)}</ul>}</section>;
}

/** Facebook engagement section streams in separately so the system stats render immediately. */
async function Engagement({ allowedIds }: { allowedIds: string[] | null }) {
  const result = await bestTimeFromEngagement(15, 5, allowedIds === null ? null : new Set(allowedIds));
  const totals = new Map<string, { label: string; value: number; samples:number }>();
  for (const { perf } of result.posts) for (const m of perf.metrics) { const t = totals.get(m.key) ?? { label: m.label, value: 0, samples:0 }; t.value += m.value;t.samples++; totals.set(m.key, t); }
  const goals=result.observations.map(({row,perf,evidence})=>reachGoal(row.at,perf.metrics.find(m=>m.key==='post_media_view')?.value,perf.fetchedAt,evidence));
  const goalCounts=Object.keys(REACH_LABELS).map(state=>({state:state as ReachState,count:goals.filter(g=>g.state===state).length}));
  return <section className="card"><h2>أداء Facebook (آخر {result.samples} منشورًا ببيانات متاحة)</h2>
    <p>عينة من آخر {result.attempted} منشورًا نشرها النظام، وليست إجمالي مشاهدات الصفحة. مجموع المشاهدين الفريدين لكل منشور قد يحتسب الشخص نفسه أكثر من مرة.</p>
    <div className="metrics-row compact">
      {!totals.has('post_media_view')&&<div className="metric"><small>المشاهدات</small><strong>—</strong><small>لم تتوفر بيانات المشاهدات من Facebook</small></div>}
      {[...totals.entries()].filter(([k]) => !k.includes(".")).map(([k,t])=><div className="metric" key={k}><small>{t.label}</small><strong dir="ltr">{t.value.toLocaleString("ar-SA-u-nu-latn")}</strong><small>بيانات {t.samples} من {result.attempted} منشورًا</small></div>)}
    </div>
    {result.warnings.length>0&&<div className="alert alert-info"><strong>بعض بيانات الأداء غير متاحة، وليست صفرًا.</strong><ul>{result.warnings.map(w=><li key={w}>{w}</li>)}</ul><a href="/pages">مراجعة ربط الصفحات وصلاحيات الإحصاءات</a></div>}
    <h3>هدف 1000 مشاهدة خلال أول 24 ساعة</h3>
    <p>تقييم العينة المعروضة فقط، وليس جميع منشورات الصفحات أو الريلز. هذا هدف للقياس وليس ضمانًا للوصول.</p>
    <div className="metrics-row compact">{goalCounts.map(g=><div key={g.state} className="metric"><small>{REACH_LABELS[g.state]}</small><strong>{g.count}</strong></div>)}</div>
    <small>يُحفظ أول رصد للهدف داخل المهلة عند قراءة هذه العينة. القياس لا يعيد بناء أول 24 ساعة بأثر رجعي، ولا يشمل منشورات لم تُفحص؛ وقد تتأخر بيانات Meta.</small>
    <h3>أفضل وقت للنشر</h3>
    {result.recommendation ? <p><strong>{result.recommendation.label}</strong> · متوسط تفاعل {result.recommendation.avgEngagement} (من {result.recommendation.basedOn} منشور في هذا الوقت)</p> : <p>لا توجد بيانات تفاعل كافية أو تفاعلات فعلية لبناء توصية موثوقة. لن نعرض أفضل وقت مبنيًا على أصفار.</p>}
    <small>المصدر: Facebook Graph API. تُعاد قراءة المقاييس عند زيارة الصفحة بعد انتهاء التخزين المؤقت (5 دقائق)، وقد يتأخر تحديثها لدى Meta.</small>
  </section>;
}

export default async function Analytics() {
  const session = await pageSession();
  const allowed = session ? await allowedPageIds({ id: session.userId, role: session.role }) : new Set<string>();
  const a = await systemAnalytics(undefined, allowed);
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
    <Suspense fallback={<section className="card"><h2>أداء Facebook</h2><p>جارٍ جلب البيانات من Facebook…</p></section>}><Engagement allowedIds={allowed === null ? null : Array.from(allowed)} /></Suspense>
  </AppShell>;
}
