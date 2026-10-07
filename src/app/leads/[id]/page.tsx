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
import { LeadAssignment } from "./lead-assignment";
import { LeadFollowup } from "./lead-followup";
import { leadDateLabel } from "@/services/leads-dates";
import { auditLabel } from "@/services/audit-labels";

export const dynamic = "force-dynamic";
export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await pageSession();
  const unavailable = <AppShell title="تفاصيل العميل"><div className="alert alert-info">العميل غير موجود أو غير متاح لك. <Link href="/leads">العودة للقائمة</Link></div></AppShell>;
  if (!session || !can(session.role, "leads.read") || !isUuid(id)) return unavailable;
  try {
    const scope = leadPageScope(await allowedPageIds({ id: session.userId, role: session.role }), "l.page_id");
    const result = await getDb().execute(sql`select l.id,l.name,l.contact,l.status,l.notes,l.source,l.assigned_to,l.created_at::text,l.last_contact_at::text,l.follow_up_at::text,l.follow_up_completed_at::text,u.name as assigned_name,l.updated_at::text as updated_at,p.name as page_name from leads l left join facebook_pages p on p.id=l.page_id left join users u on u.id=l.assigned_to where l.id=${id} and ${scope} limit 1`);
    const row = result.rows[0];
    if (!row) return unavailable;
    const events = await getDb().execute(sql`select action,created_at::text as created_at from activity_logs where entity_type='lead' and entity_id=${id} order by created_at desc limit 30`);
    return <AppShell title="تفاصيل العميل"><PageHeader title={String(row.name)} description={`${row.page_name ?? "بدون صفحة"} · ${row.source === "messenger" ? "Messenger" : "إدخال يدوي"}`} actions={<Link className="btn btn-secondary" href="/leads">العودة للعملاء</Link>} />
      <LeadEditor key={String(row.updated_at)} editable={can(session.role, "leads.edit")} lead={{ id, name: String(row.name), contact: row.contact ? String(row.contact) : null, status: String(row.status), notes: row.notes ? String(row.notes) : null, updatedAt: String(row.updated_at) }} />
      <LeadAssignment key={`assignment:${row.updated_at}`} id={id} version={String(row.updated_at)} assignedId={row.assigned_to?String(row.assigned_to):null} assignedName={row.assigned_name?String(row.assigned_name):null} editable={can(session.role,"leads.assign")}/>
      <LeadFollowup key={`followup:${row.updated_at}`} id={id} version={String(row.updated_at)} dueAt={row.follow_up_at?String(row.follow_up_at):null} completedAt={row.follow_up_completed_at?String(row.follow_up_completed_at):null} editable={can(session.role,"leads.edit")}/>
      <section className="card"><h2>تواريخ العميل</h2><dl><dt>تاريخ الإنشاء</dt><dd>{leadDateLabel(row.created_at)}</dd><dt>آخر تواصل مسجّل</dt><dd>{leadDateLabel(row.last_contact_at)}</dd><dt>آخر تحديث</dt><dd>{leadDateLabel(row.updated_at)}</dd></dl><p>جميع التواريخ بتوقيت الرياض.</p></section>
      <section className="card"><h2>سجل نشاط العميل</h2>{events.rows.length ? <ul>{events.rows.map((event, index) => <li key={index}>{auditLabel(String(event.action))===event.action?"تحديث العميل":auditLabel(String(event.action))} · {leadDateLabel(event.created_at)}</li>)}</ul> : <p>لا توجد أحداث مسجلة بعد.</p>}</section>
    </AppShell>;
  } catch { console.error("Lead detail unavailable", { code: "LEAD_DETAIL_FAILED" }); return <AppShell title="تفاصيل العميل"><div className="alert alert-warning">تعذر تحميل بيانات العميل. <Link href={`/leads/${id}`}>إعادة المحاولة</Link></div></AppShell>; }
}
