import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { guard, isUuid } from "@/services/api-guard";
import { can, currentUser } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { leadPageScope } from "@/services/leads-access";
import { leadPatchSchema, leadUpdateValues } from "@/services/leads-model";
import { getDb } from "@/db";
import { logAudit } from "@/services/audit";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request, true, "leads.edit");
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "معرّف العميل غير صالح" }, { status: 400 });
  const parsed = leadPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "تحقق من بيانات العميل وحاول مجددًا" }, { status: 400 });
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401 });
    if (!can(user.role,"leads.edit")) return NextResponse.json({error:"ليست لديك صلاحية لتعديل العميل"},{status:403});
    const scope = leadPageScope(await allowedPageIds(user));
    const db = getDb();
    const rows = await db.execute(sql`update leads set ${leadUpdateValues(parsed.data)}
      where id=${id} and ${scope} and updated_at=${parsed.data.expectedUpdatedAt}::timestamptz
      returning id,updated_at::text as updated_at`);
    if (!rows.rows.length) {
      const exists = await db.execute(sql`select id from leads where id=${id} and ${scope}`);
      return NextResponse.json({ error: exists.rows.length ? "عُدّل العميل من نافذة أخرى. أعد تحميل الصفحة قبل الحفظ." : "العميل غير موجود أو غير متاح لك" }, { status: exists.rows.length ? 409 : 404 });
    }
    await logAudit("lead.updated", "lead", id, { status: parsed.data.status, fields: "name" in parsed.data ? ["name", "contact", "status", "notes"] : ["status"] });
    return NextResponse.json(rows.rows[0]);
  } catch {
    console.error("Lead update unavailable", { code: "LEAD_UPDATE_FAILED" });
    return NextResponse.json({ error: "تعذر حفظ العميل. حاول لاحقًا." }, { status: 503 });
  }
}
