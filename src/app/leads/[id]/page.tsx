import Link from "next/link";
import { sql } from "drizzle-orm";
import { isUuid } from "@/services/api-guard";
import { pageSession } from "@/services/session-server";
import { can } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { leadPageScope } from "@/services/leads-access";
import { getDb } from "@/db";
import { AppShell } from "../../ui/app-shell";
import { PageHeader } from "../../ui/kit";
import { LeadEditor } from "./lead-editor";

export const dynamic = "force-dynamic";
export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await pageSession();
  const unavailable = <AppShell title="تفاصيل العميل"><div className="alert alert-info">العميل غير موجود أو غير متاح لك. <Link href="/leads">العودة للقائمة</Link></div></AppShell>;
  if (!session || !can(session.role, "leads.read") || !isUuid(id)) return unavailable;
  try {
    const scope = leadPageScope(await allowedPageIds({ id: session.userId, role: session.role }), "l.page_id");
    const result = await getDb().execute(sql`select l.id,l.name,l.contact,l.status,l.notes,l.source,l.updated_at::text as updated_at,p.name as page_name from leads l left join facebook_pages p on p.id=l.page_id where l.id=${id} and ${scope} limit 1`);
    const row = result.rows[0];
    if (!row) return unavailable;
    const events = await getDb().execute(sql`select action,created_at::text as created_at from activity_logs where entity_type='lead' and entity_id=${id} order by created_at desc limit 30`);
    return <AppShell title="تفاصيل العميل"><PageHeader title={String(row.name)} description={`${row.page_name ?? "بدون صفحة"} · ${row.source === "messenger" ? "Messenger" : "إدخال يدوي"}`} actions={<Link className="btn btn-secondary" href="/leads">العودة للعملاء</Link>} />
      <LeadEditor key={String(row.updated_at)} editable={can(session.role, "leads.edit")} lead={{ id, name: String(row.name), contact: row.contact ? String(row.contact) : null, status: String(row.status), notes: row.notes ? String(row.notes) : null, updatedAt: String(row.updated_at) }} />
      <section className="card"><h2>سجل نشاط العميل</h2>{events.rows.length ? <ul>{events.rows.map((event, index) => <li key={index}>{event.action === "lead.updated" ? "تعديل بيانات العميل" : event.action === "lead.converted_from_messenger" ? "التحويل من Messenger" : "تحديث العميل"} · {new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" }).format(new Date(String(event.created_at)))}</li>)}</ul> : <p>لا توجد أحداث مسجلة بعد.</p>}</section>
    </AppShell>;
  } catch { console.error("Lead detail unavailable", { code: "LEAD_DETAIL_FAILED" }); return <AppShell title="تفاصيل العميل"><div className="alert alert-warning">تعذر تحميل بيانات العميل. <Link href={`/leads/${id}`}>إعادة المحاولة</Link></div></AppShell>; }
}
