import Link from "next/link";
import { LeadListTable } from './lead-list-table';
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
import { leadOwnership,leadOwnershipScope } from "@/services/leads-ownership";
import { leadFollowupFilter,leadFollowupScope } from "@/services/leads-followup-filters";
export const dynamic = "force-dynamic";
const labels: Record<string,string> = LEAD_LABELS;
export default async function Leads({ searchParams }:{ searchParams:Promise<{status?:string;q?:string;cursor?:string;ownership?:string;followup?:string}> }) {
  const params=await searchParams;
  const status=params.status && Object.hasOwn(labels,params.status)?params.status:"";
  const q=(params.q??"").trim().slice(0,100);
  const ownership=leadOwnership(params.ownership);
  const followup=leadFollowupFilter(params.followup);
  const href=(stage=status,token?:string)=>leadListHref(q,stage,token,ownership,followup);
  let cursor:ReturnType<typeof decodeLeadCursor>=null;
  try {cursor=decodeLeadCursor(params.cursor);}catch{return <AppShell title="العملاء المحتملون"><div className="alert alert-info">رابط الصفحة غير صالح. <Link href={href()}>العودة إلى النتائج</Link></div></AppShell>;}
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
    and ${leadOwnershipScope(ownership,session.userId)}
    and ${leadFollowupScope(followup)}
    and (${q}='' or l.name ilike ${leadSearchPattern(q)} or l.contact ilike ${leadSearchPattern(q)})
    and ${cursor?sql`(l.updated_at,l.id)<(${cursor.time}::timestamptz,${cursor.id}::uuid)`:sql`true`}
    order by l.updated_at desc,l.id desc limit 51`);
  rows=result.rows as Array<Record<string,unknown>>;
  }catch{failed=true;console.error("Leads list failed",{code:"LEADS_UNAVAILABLE"});}
  const hasMore=rows.length>50;
  rows=rows.slice(0,50);
  const last=rows.at(-1);
  return <AppShell title="العملاء المحتملون">
    <PageHeader title="العملاء المحتملون" description="تابع الأشخاص المهتمين القادمين من Messenger والتفاعلات، وحوّل المحادثة إلى فرصة متابعة." actions={<>{can(session.role,"leads.create") ? <Link className="btn btn-primary" href="/leads/new">إضافة عميل</Link> : null}<Link className="btn btn-secondary" href={`/leads/board?${new URLSearchParams({q,ownership})}`}>لوحة المراحل</Link><Link className="btn btn-secondary" href="/inbox/messages">Messenger</Link></>} />
    <Link className="btn btn-secondary" href="/leads/analytics">إحصائيات المصادر والتحويل</Link>
    <form action="/leads" className="leads-filter"><input type="hidden" name="followup" value={followup}/><input name="q" defaultValue={q} maxLength={100} aria-label="البحث عن عميل" placeholder="بحث بالاسم أو معلومات الاتصال"/><input type="hidden" name="status" value={status}/><label>الإسناد<select name="ownership" defaultValue={ownership}><option value="all">كل العملاء</option><option value="mine">عملائي</option><option value="unassigned">غير المسندين</option></select></label><button className="btn btn-secondary" type="submit">بحث</button></form>
    <nav className="segmented leads-filter" aria-label="تصفية المتابعات">{[["all","كل المتابعات"],["due","مستحقة الآن"],["upcoming","قادمة"],["completed","مكتملة"]].map(([value,label])=><Link key={value} className={followup===value?"active":""} href={leadListHref(q,status,undefined,ownership,value)}>{label}</Link>)}</nav>
    <div className="segmented leads-filter">{[["","الكل"],...Object.entries(labels)].map(([v,l])=><Link key={v} className={status===v?"active":""} href={href(v)}>{l}</Link>)}</div>
    {failed?<div className="alert alert-info" role="alert">تعذر تحميل العملاء المحتملين. <Link href={href(status,params.cursor)}>إعادة المحاولة</Link></div>:<LeadListTable key={href(status,params.cursor)} editable={can(session.role,'leads.edit')} rows={rows.map(r=>({id:String(r.id),name:String(r.name),contact:r.contact?String(r.contact):null,source:String(r.source),status:String(r.status),pageName:r.page_name?String(r.page_name):null,updatedAt:new Date(String(r.updated_at)).toISOString(),version:String(r.cursor_time)}))}/>}
    {!failed&&<nav aria-label="صفحات العملاء">{cursor&&<Link className="btn btn-secondary" href={href()}>أول صفحة</Link>}{hasMore&&last&&<Link className="btn btn-secondary" href={href(status,encodeLeadCursor(String(last.cursor_time),String(last.id)))}>التالي</Link>}</nav>}
  </AppShell>;
}
