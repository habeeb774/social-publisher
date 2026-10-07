import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { AppShell } from "../ui/app-shell";
import { PageHeader } from "../ui/kit";
export const dynamic = "force-dynamic";
const labels: Record<string,string> = { new:"جديد", contacted:"تم التواصل", qualified:"مهتم", won:"تم التحويل", lost:"غير مهتم" };
export default async function Leads({ searchParams }:{ searchParams:Promise<{status?:string}> }) {
  const status=(await searchParams).status ?? "";
  const db=getDb();
  const result=await db.execute(sql`select l.id,l.name,l.contact,l.source,l.status,l.notes,l.updated_at,p.name as page_name
    from leads l left join facebook_pages p on p.id=l.page_id
    where (${status}='' or l.status=${status}) order by l.updated_at desc limit 300`).catch(()=>({rows:[]}));
  const rows=result.rows as Array<Record<string,unknown>>;
  return <AppShell title="العملاء المحتملون">
    <PageHeader title="العملاء المحتملون" description="تابع الأشخاص المهتمين القادمين من Messenger والتفاعلات، وحوّل المحادثة إلى فرصة متابعة." actions={<Link className="btn btn-secondary" href="/inbox/messages">Messenger</Link>} />
    <div className="segmented leads-filter">{[["","الكل"],...Object.entries(labels)].map(([v,l])=><Link key={v} className={status===v?"active":""} href={v?`/leads?status=${v}`:"/leads"}>{l}</Link>)}</div>
    <section className="card card-flush"><div className="table-wrap"><table><thead><tr><th>العميل</th><th>المصدر</th><th>الصفحة</th><th>الحالة</th><th>آخر تحديث</th></tr></thead><tbody>
      {rows.map((r)=><tr key={String(r.id)}><td><strong>{String(r.name)}</strong>{r.contact&&<small className="block">{String(r.contact)}</small>}</td><td>{r.source==="messenger"?"Messenger":String(r.source)}</td><td>{r.page_name?String(r.page_name):"—"}</td><td><span className="badge badge-info">{labels[String(r.status)]??String(r.status)}</span></td><td><small>{new Intl.DateTimeFormat("ar-SA",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Riyadh"}).format(new Date(String(r.updated_at)))}</small></td></tr>)}
      {!rows.length&&<tr><td colSpan={5}><div className="empty-inline">لا يوجد عملاء محتملون بهذه الحالة بعد.</div></td></tr>}
    </tbody></table></div></section>
  </AppShell>;
}
