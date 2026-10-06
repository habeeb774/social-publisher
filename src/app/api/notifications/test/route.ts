import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/services/api-guard";
import { sendEmail, sendTestEmail } from "@/services/alerts";
import { buildWeeklyReport } from "@/services/weekly-report";
import { emailBackup } from "@/services/backup";
import { logAudit } from "@/services/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const denied = await guard(request, true, "settings.manage");
  if (denied) return denied;
  if (request.nextUrl.searchParams.get("kind") === "backup") {
    const ok = await emailBackup();
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
  }
  if (request.nextUrl.searchParams.get("kind") === "weekly") {
    const ok = await sendEmail("التقرير الأسبوعي (تجريبي)", await buildWeeklyReport());
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
  }
  const result = await sendTestEmail();
  await logAudit("notification.test_email", "settings", null, { ok: result.ok, error: result.ok ? null : result.error });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
