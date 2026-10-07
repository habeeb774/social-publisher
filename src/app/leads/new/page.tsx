import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { pageSession } from "@/services/session-server";
import { can } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { leadPageScope } from "@/services/leads-access";
import { leadSearchPattern } from "@/services/leads-filters";
import { AppShell } from "../../ui/app-shell";
import { PageHeader } from "../../ui/kit";
import { LeadCreateForm } from "./lead-create-form";

export const dynamic = "force-dynamic";
export default async function NewLead({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await pageSession();
  if (!session || !can(session.role,"leads.create")) return <AppShell title="إضافة عميل"><div className="alert alert-info">ليست لديك صلاحية لإضافة عميل.</div></AppShell>;
  const q = ((await searchParams).q ?? "").trim().slice(0,100);
  let pages: Array<{ id: string; name: string; platform: string }> = [];
  let failed = false;
  try {
    const allowed = await allowedPageIds({ id: session.userId, role: session.role });
    const result = await getDb().execute(sql`select p.id,p.name,p.platform from facebook_pages p
      where p.is_active=true and ${leadPageScope(allowed,"p.id")}
      and (${q}='' or p.name ilike ${leadSearchPattern(q)}) order by p.name,p.id limit 201`);
    pages = result.rows as typeof pages;
  } catch { failed = true; console.error("Lead pages unavailable", { code: "LEAD_PAGES_FAILED" }); }
  const hasMore = pages.length > 200;
  pages = pages.slice(0,200);
  return <AppShell title="إضافة عميل">
    <PageHeader title="إضافة عميل محتمل" description="سجّل فرصة جديدة واربطها بصفحة تملك صلاحية إدارتها."/>
    {hasMore || q ? <form action="/leads/new" className="leads-filter"><label>اختر الصفحة قبل تعبئة بيانات العميل<input name="q" maxLength={100} defaultValue={q} placeholder="بحث باسم الصفحة"/></label><button className="btn btn-secondary">بحث عن صفحة</button>{q ? <Link href="/leads/new">مسح البحث</Link> : null}</form> : null}
    {hasMore ? <div className="alert alert-info">تظهر أول 200 صفحة. ابحث باسم الصفحة المطلوبة لتضييق النتائج.</div> : null}
    {failed ? <div className="alert alert-warning" role="alert">تعذر تحميل الصفحات. <Link href={`/leads/new?${new URLSearchParams({q})}`}>إعادة المحاولة</Link></div> : pages.length ? <LeadCreateForm key={q} pages={pages}/> : <div className="alert alert-info">{q ? "لا توجد صفحة مطابقة متاحة لك. جرّب بحثًا آخر." : "لا توجد صفحة نشطة متاحة لك. اربط صفحة أو اطلب من المدير ضبط صلاحياتك."} <Link href="/leads">العودة للعملاء</Link></div>}
  </AppShell>;
}
