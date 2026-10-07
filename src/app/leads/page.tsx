import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { AppShell } from "../ui/app-shell";
import { PageHeader } from "../ui/kit";
import { pageSession } from "@/services/session-server";
import { can } from "@/services/rbac";
import { LEAD_LABELS } from "@/services/leads-stages";
import { allowedPageIds } from "@/services/access-scope";
import { leadPageScope } from "@/services/leads-access";
import { decodeLeadCursor, encodeLeadCursor, leadListHref, leadSearchPattern } from "@/services/leads-filters";
export const dynamic = "force-dynamic";
const labels: Record<string,string> = LEAD_LABELS;
export default async function Leads({ searchParams }:{ searchParams:Promise<{status?:string;q?:string;cursor?:string}> }) {
  const params=await searchParams;
  const status=params.status && Object.hasOwn(labels,params.status)?params.status:"";
  const q=(params.q??"").trim().slice(0,100);
  let cursor:ReturnType<typeof decodeLeadCursor>=null;
  try {cursor=decodeLeadCursor(params.cursor);}catch{return <AppShell title="العملاء المحتملون"><div className="alert alert-info">رابط الصفحة غير صالح. <Link href={leadListHref(q,status)}>العودة إلى النتائج</Link></div></AppShell>;}
  const db=getDb();
  const session=await pageSession();
  if(!session || !can(session.role,"leads.read"))return <AppShell title="العملاء المحتملون"><div className="alert alert-info">ليست لديك صلاحية لعرض العملاء المحتملين.</div></AppShell>;
  let rows: Array<Record<string,unknown>>=[];
  let failed=false;
  try {
  const allowed=await allowedPageIds({id:session.userId,role:session.role});
  const result=await db.execute(sql`select l.id,l.name,l.contact,l.source,l.status,l.updated_at,p.name as page_name,
    to_char(l.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_time
    from leads l left join facebook_pages p on p.id=l.page_id
    where (${status}='' or l.status=${status}) and ${leadPageScope(allowed,"l.page_id")}
    and (${q}='' or l.name ilike ${leadSearchPattern(q)} or l.contact ilike ${leadSearchPattern(q)})
    and ${cursor?sql`(l.updated_at,l.id)<(${cursor.time}::timestamptz,${cursor.id}::uuid)`:sql`true`}
    order by l.updated_at desc,l.id desc limit 51`);
  rows=result.rows as Array<Record<string,unknown>>;
  }catch{failed=true;console.error("Leads list failed",{code:"LEADS_UNAVAILABLE"});}
  const hasMore=rows.length>50;
  rows=rows.slice(0,50);
  const last=rows.at(-1);
  return <AppShell title="العملاء المحتملون">
    <PageHeader title="العملاء المحتملون" description="تابع الأشخاص المهتمين القادمين من Messenger والتفاعلات، وحوّل المحادثة إلى فرصة متابعة." actions={<Link className="btn btn-secondary" href="/inbox/messages">Messenger</Link>} />
    <form action="/leads" className="leads-filter"><input name="q" defaultValue={q} maxLength={100} aria-label="البحث عن عميل" placeholder="بحث بالاسم أو معلومات الاتصال"/><input type="hidden" name="status" value={status}/><button className="btn btn-secondary" type="submit">بحث</button></form>
    <div className="segmented leads-filter">{[["","الكل"],...Object.entries(labels)].map(([v,l])=><Link key={v} className={status===v?"active":""} href={leadListHref(q,v)}>{l}</Link>)}</div>
    {failed?<div className="alert alert-info" role="alert">تعذر تحميل العملاء المحتملين. <Link href={status?`/leads?status=${encodeURIComponent(status)}`:"/leads"}>إعادة المحاولة</Link></div>:<section className="card card-flush"><div className="table-wrap"><table><thead><tr><th>العميل</th><th>المصدر</th><th>الصفحة</th><th>الحالة</th><th>آخر تحديث</th></tr></thead><tbody>
      {rows.map((r)=><tr key={String(r.id)}><td><Link href={`/leads/${String(r.id)}`}><strong>{String(r.name)}</strong></Link>{Boolean(r.contact)&&<small className="block">{String(r.contact)}</small>}</td><td>{r.source==="messenger"?"Messenger":String(r.source)}</td><td>{r.page_name?String(r.page_name):"—"}</td><td><span className="badge badge-info">{labels[String(r.status)]??String(r.status)}</span></td><td><small>{new Intl.DateTimeFormat("ar-SA",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Riyadh"}).format(new Date(String(r.updated_at)))}</small></td></tr>)}
      {!rows.length&&<tr><td colSpan={5}><div className="empty-inline">لا يوجد عملاء محتملون بهذه الحالة بعد.</div></td></tr>}
    </tbody></table></div></section>}
    {!failed&&<nav aria-label="صفحات العملاء">{cursor&&<Link className="btn btn-secondary" href={leadListHref(q,status)}>أول صفحة</Link>}{hasMore&&last&&<Link className="btn btn-secondary" href={leadListHref(q,status,encodeLeadCursor(String(last.cursor_time),String(last.id)))}>التالي</Link>}</nav>}
  </AppShell>;
}
