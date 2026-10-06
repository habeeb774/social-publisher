import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/services/api-guard";
import { sendTestEmail } from "@/services/alerts";
import { logAudit } from "@/services/audit";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const denied = await guard(request, true, "settings.manage");
  if (denied) return denied;
  const result = await sendTestEmail();
  await logAudit("notification.test_email", "settings", null, { ok: result.ok, error: result.ok ? null : result.error });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
