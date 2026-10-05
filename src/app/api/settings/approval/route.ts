import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { setSetting } from "@/services/settings-store";

/** Toggles the optional approval workflow. Existing scheduled posts are not affected. */
export async function PUT(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = z.object({ required: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "قيمة غير صالحة" }, { status: 400 });
  await setSetting("approval_required", parsed.data.required);
  await logAudit("settings.approval_updated", "settings", null, { required: parsed.data.required });
  return NextResponse.json({ ok: true });
}
