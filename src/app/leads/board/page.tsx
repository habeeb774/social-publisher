import Link from "next/link";
import { AppShell } from "../../ui/app-shell";
import { PageHeader } from "../../ui/kit";
import { pageSession } from "@/services/session-server";
import { can } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { readLeadBoard } from "@/services/leads-board-data";
import { LeadBoard } from "./lead-board";
import { leadOwnership } from "@/services/leads-ownership";
export const dynamic="force-dynamic";
export default async function Board({searchParams}:{searchParams:Promise<{q?:string;ownership?:string}>}){
  const session=await pageSession();
  if(!session||!can(session.role,"leads.read"))return <AppShell title="لوحة العملاء"><div className="alert alert-info">ليست لديك صلاحية لعرض العملاء.</div></AppShell>;
  const params=await searchParams,q=(params.q??"").trim().slice(0,100),ownership=leadOwnership(params.ownership);
  try{
    const columns=await readLeadBoard(await allowedPageIds({id:session.userId,role:session.role}),q,undefined,undefined,ownership,session.userId);
    return <AppShell title="لوحة العملاء"><PageHeader title="لوحة العملاء المحتملين" description="اسحب العميل إلى مرحلة أخرى، أو استخدم قائمة النقل على الجوال. الأعداد المعروضة تخص البطاقات المحملة." actions={<Link className="btn btn-secondary" href={`/leads?${new URLSearchParams({q,ownership})}`}>عرض القائمة</Link>}/>
      <form action="/leads/board" className="lead-board-search"><label>البحث عن عميل<input name="q" defaultValue={q} maxLength={100} placeholder="الاسم أو معلومات الاتصال"/></label><label>الإسناد<select name="ownership" defaultValue={ownership}><option value="all">كل العملاء</option><option value="mine">عملائي</option><option value="unassigned">غير المسندين</option></select></label><button className="btn btn-secondary">بحث</button></form>
      <LeadBoard key={JSON.stringify([q,ownership,columns])} initial={columns} editable={can(session.role,"leads.edit")} q={q} ownership={ownership}/>
    </AppShell>;
  }catch{console.error("Lead board page unavailable",{code:"LEAD_BOARD_FAILED"});return <AppShell title="لوحة العملاء"><div className="alert alert-warning">تعذر تحميل اللوحة. <Link href={`/leads/board?${new URLSearchParams({q,ownership})}`}>إعادة المحاولة</Link></div></AppShell>;}
}
