import Link from "next/link";
import { getDb } from "@/db";
import { pageSession } from "@/services/session-server";
import { can } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { leadAnalyticsRange,leadAnalyticsQuery,leadAnalyticsSummary,leadAnalyticsFilters,leadAnalyticsPagesQuery,type LeadAnalyticsRow } from "@/services/leads-analytics";
import { AppShell } from "../../ui/app-shell";
import { PageHeader } from "../../ui/kit";
export const dynamic="force-dynamic";
export const metadata={title:"إحصائيات العملاء المحتملين"};
export default async function LeadAnalytics({searchParams}:{searchParams:Promise<{days?:string;from?:string;to?:string;platform?:string;pageId?:string;pageQ?:string}>}) {
  const session=await pageSession();
  if(!session||!can(session.role,"leads.read"))return <AppShell title="إحصائيات العملاء"><div className="alert alert-info">ليست لديك صلاحية لعرض إحصائيات العملاء.</div></AppShell>;
  let range:ReturnType<typeof leadAnalyticsRange>;
  const params=await searchParams;
  let filters:ReturnType<typeof leadAnalyticsFilters.parse>;
  const pageQ=(params.pageQ??'').trim().slice(0,100);
  try{range=leadAnalyticsRange(params);filters=leadAnalyticsFilters.parse(params);}catch{return <AppShell title="إحصائيات العملاء"><div className="alert alert-info">الفترة غير صالحة أو خيارات التصفية غير صالحة. اختر تاريخين بالترتيب وفترة لا تتجاوز سنة. <Link href="/leads/analytics">إعادة اختيار الفترة</Link></div></AppShell>;}
  const href=(dates:Record<string,string>)=>`/leads/analytics?${new URLSearchParams({...dates,...filters,pageQ})}`;
  let rows:LeadAnalyticsRow[]=[];
  let pages:Array<{id:string;name:string;platform:string}>=[];
  let deniedPage=false;
  try{
    const scope=await allowedPageIds({id:session.userId,role:session.role});
    deniedPage=Boolean(filters.pageId&&scope!==null&&!scope.has(filters.pageId));
    if(!deniedPage){
    const [metrics,options]=await Promise.all([getDb().execute(leadAnalyticsQuery(range,scope,filters)),getDb().execute(leadAnalyticsPagesQuery(scope,pageQ))]);
    rows=metrics.rows as LeadAnalyticsRow[];pages=options.rows as typeof pages;
    }
  }catch{
    console.error("Lead analytics unavailable",{code:"LEAD_ANALYTICS_UNAVAILABLE"});
    return <AppShell title="إحصائيات العملاء"><div className="alert alert-info" role="alert">تعذر تحميل الإحصائيات. <Link href={href({from:range.from,to:range.to})}>إعادة المحاولة</Link></div></AppShell>;
  }
  if(deniedPage)return <AppShell title="إحصائيات العملاء"><div className="alert alert-info">الصفحة غير متاحة ضمن صلاحياتك. <Link href="/leads/analytics">العودة إلى التقرير</Link></div></AppShell>;
  const totals=leadAnalyticsSummary(rows);
  const sources:Record<string,string>={manual:"يدوي",messenger:"Messenger",other:"مصادر أخرى"};
  return <AppShell title="إحصائيات العملاء">
    <PageHeader title="إحصائيات العملاء المحتملين" description="العملاء الذين أُنشئوا خلال الفترة، بحسب حالتهم الحالية. النتائج ضمن الصفحات المسموح لك بها." actions={<Link className="btn btn-secondary" href="/leads">العملاء المحتملون</Link>}/>
    <nav className="segmented leads-filter" aria-label="فترة الإحصائيات">{[7,30,90].map(days=><Link key={days} href={href({days:String(days)})}>{days} يومًا</Link>)}</nav>
    <form className="leads-filter" action="/leads/analytics"><label>من<input type="date" name="from" required defaultValue={range.from}/></label><label>إلى<input type="date" name="to" required defaultValue={range.to}/></label>
      <label>المنصة<select name="platform" defaultValue={filters.platform}><option value="all">كل المنصات</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option></select></label>
      <label>الصفحة<select name="pageId" defaultValue={filters.pageId}><option value="">كل الصفحات المسموح بها</option>{filters.pageId&&!pages.slice(0,200).some(page=>page.id===filters.pageId)&&<option value={filters.pageId}>الصفحة المحددة سابقًا</option>}{pages.slice(0,200).map(page=><option key={page.id} value={page.id}>{page.name} ({page.platform})</option>)}</select></label>
      <label>البحث عن صفحة<input name="pageQ" defaultValue={pageQ} maxLength={100} placeholder="اسم الصفحة"/></label><button className="btn btn-secondary">عرض التقرير</button></form>
    {pages.length>200&&<p>تظهر أول 200 صفحة. ابحث بالاسم لتضييق خيارات الصفحات.</p>}
    <p>الفترة: <b dir="ltr">{range.from} — {range.to}</b> بتوقيت الرياض.</p>
    <section className="card"><h2>ملخص الفترة</h2><p>إجمالي العملاء: <strong>{totals.total}</strong> · مكتسبون: <strong>{totals.won}</strong> · مفقودون: <strong>{totals.lost}</strong></p><p>نسبة التحويل إلى مكتسب: <strong>{totals.conversion===null?"غير متاحة":`${totals.conversion}%`}</strong></p><small>عدد العملاء المكتسبين حاليًا ÷ إجمالي العملاء الذين أُنشئوا في الفترة. ليست نسبة الصفقات المغلقة أثناء الفترة.</small></section>
    {rows.length?<section className="card card-flush"><div className="table-wrap"><table><caption>أداء مصادر العملاء</caption><thead><tr><th>المصدر</th><th>العملاء</th><th>مكتسبون</th><th>مفقودون</th><th>التحويل</th></tr></thead><tbody>{rows.map(row=><tr key={row.source}><td>{sources[row.source]??"مصادر أخرى"}</td><td>{row.total}</td><td>{row.won}</td><td>{row.lost}</td><td>{leadAnalyticsSummary([row]).conversion??"—"}%</td></tr>)}</tbody></table></div></section>:<div className="empty-inline">لا يوجد عملاء أُنشئوا خلال هذه الفترة ضمن صلاحياتك.</div>}
  </AppShell>;
}
