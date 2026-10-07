import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { guard, isUuid } from "@/services/api-guard";
import { can, currentUser } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { leadPageScope } from "@/services/leads-access";
import { leadFollowupSchema, followupScheduleValid, leadFollowupValues } from "@/services/leads-followup-model";
import { getDb } from "@/db";
import { logAudit } from "@/services/audit";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request, true, "leads.edit");
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "معرّف العميل غير صالح" }, { status: 400 });
  const parsed = leadFollowupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.action === "schedule" && !followupScheduleValid(parsed.data.dueAt))) {
    return NextResponse.json({ error: "اختر موعدًا مستقبليًا خلال سنة وتحقق من بيانات المتابعة" }, { status: 400 });
  }
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401 });
    if (!can(user.role, "leads.edit")) return NextResponse.json({ error: "ليست لديك صلاحية لتعديل العميل" }, { status: 403 });
    const scope = leadPageScope(await allowedPageIds(user));
    const db = getDb();
    const actionable = parsed.data.action === "complete"
      ? sql`follow_up_at is not null and follow_up_completed_at is null` : sql`true`;
    const rows = await db.execute(sql`update leads set ${leadFollowupValues(parsed.data, isUuid(user.id) ? user.id : null)}
      where id=${id} and ${scope} and updated_at=${parsed.data.expectedUpdatedAt}::timestamptz and ${actionable}
      returning id,updated_at::text as updated_at`);
    if (!rows.rows.length) {
      const exists = await db.execute(sql`select id from leads where id=${id} and ${scope}`);
      return NextResponse.json({ error: exists.rows.length ? "تغيّرت بيانات المتابعة. أعد تحميل الصفحة قبل الحفظ." : "العميل غير موجود أو غير متاح لك" }, { status: exists.rows.length ? 409 : 404 });
    }
    await logAudit(`lead.followup.${parsed.data.action}`, "lead", id, { action: parsed.data.action });
    return NextResponse.json(rows.rows[0]);
  } catch {
    console.error("Lead follow-up unavailable", { code: "LEAD_FOLLOWUP_FAILED" });
    return NextResponse.json({ error: "تعذر حفظ المتابعة. حاول لاحقًا." }, { status: 503 });
  }
}
