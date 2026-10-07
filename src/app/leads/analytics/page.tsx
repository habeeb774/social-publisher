import Link from "next/link";
import { getDb } from "@/db";
import { pageSession } from "@/services/session-server";
import { can } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { leadAnalyticsRange,leadAnalyticsQuery,leadAnalyticsSummary,type LeadAnalyticsRow } from "@/services/leads-analytics";
import { AppShell } from "../../ui/app-shell";
import { PageHeader } from "../../ui/kit";
export const dynamic="force-dynamic";
export const metadata={title:"إحصائيات العملاء المحتملين"};
export default async function LeadAnalytics({searchParams}:{searchParams:Promise<{days?:string;from?:string;to?:string}>}) {
  const session=await pageSession();
  if(!session||!can(session.role,"leads.read"))return <AppShell title="إحصائيات العملاء"><div className="alert alert-info">ليست لديك صلاحية لعرض إحصائيات العملاء.</div></AppShell>;
  let range:ReturnType<typeof leadAnalyticsRange>;
  try{range=leadAnalyticsRange(await searchParams);}catch{return <AppShell title="إحصائيات العملاء"><div className="alert alert-info">الفترة غير صالحة. اختر تاريخين بالترتيب وفترة لا تتجاوز سنة. <Link href="/leads/analytics">إعادة اختيار الفترة</Link></div></AppShell>;}
  let rows:LeadAnalyticsRow[];
  try{
    const scope=await allowedPageIds({id:session.userId,role:session.role});
    rows=(await getDb().execute(leadAnalyticsQuery(range,scope))).rows as LeadAnalyticsRow[];
  }catch{
    console.error("Lead analytics unavailable",{code:"LEAD_ANALYTICS_UNAVAILABLE"});
    return <AppShell title="إحصائيات العملاء"><div className="alert alert-info" role="alert">تعذر تحميل الإحصائيات. <Link href={`/leads/analytics?${new URLSearchParams({from:range.from,to:range.to})}`}>إعادة المحاولة</Link></div></AppShell>;
  }
  const totals=leadAnalyticsSummary(rows);
  const sources:Record<string,string>={manual:"يدوي",messenger:"Messenger",other:"مصادر أخرى"};
  return <AppShell title="إحصائيات العملاء">
    <PageHeader title="إحصائيات العملاء المحتملين" description="العملاء الذين أُنشئوا خلال الفترة، بحسب حالتهم الحالية. النتائج ضمن الصفحات المسموح لك بها." actions={<Link className="btn btn-secondary" href="/leads">العملاء المحتملون</Link>}/>
    <nav className="segmented leads-filter" aria-label="فترة الإحصائيات">{[7,30,90].map(days=><Link key={days} href={`/leads/analytics?days=${days}`}>{days} يومًا</Link>)}</nav>
    <form className="leads-filter" action="/leads/analytics"><label>من<input type="date" name="from" required defaultValue={range.from}/></label><label>إلى<input type="date" name="to" required defaultValue={range.to}/></label><button className="btn btn-secondary">عرض الفترة</button></form>
    <p>الفترة: <b dir="ltr">{range.from} — {range.to}</b> بتوقيت الرياض.</p>
    <section className="card"><h2>ملخص الفترة</h2><p>إجمالي العملاء: <strong>{totals.total}</strong> · مكتسبون: <strong>{totals.won}</strong> · مفقودون: <strong>{totals.lost}</strong></p><p>نسبة التحويل إلى مكتسب: <strong>{totals.conversion===null?"غير متاحة":`${totals.conversion}%`}</strong></p><small>عدد العملاء المكتسبين حاليًا ÷ إجمالي العملاء الذين أُنشئوا في الفترة. ليست نسبة الصفقات المغلقة أثناء الفترة.</small></section>
    {rows.length?<section className="card card-flush"><div className="table-wrap"><table><caption>أداء مصادر العملاء</caption><thead><tr><th>المصدر</th><th>العملاء</th><th>مكتسبون</th><th>مفقودون</th><th>التحويل</th></tr></thead><tbody>{rows.map(row=><tr key={row.source}><td>{sources[row.source]??"مصادر أخرى"}</td><td>{row.total}</td><td>{row.won}</td><td>{row.lost}</td><td>{leadAnalyticsSummary([row]).conversion??"—"}%</td></tr>)}</tbody></table></div></section>:<div className="empty-inline">لا يوجد عملاء أُنشئوا خلال هذه الفترة ضمن صلاحياتك.</div>}
  </AppShell>;
}
