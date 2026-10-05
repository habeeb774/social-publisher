import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { setSetting } from "@/services/settings-store";
import { getGeneralSettings } from "@/services/general-settings";
const body = z.object({ systemName: z.string().trim().min(1).max(60), defaultPageId: z.uuid().nullable(), defaultPublishTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) });

export async function GET(request: NextRequest) {
  const denied = await guard(request, false); if (denied) return denied;
  return NextResponse.json(await getGeneralSettings());
}
export async function PUT(request: NextRequest) {
  const denied = await guard(request, true, "settings.manage"); if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
  await setSetting("general", parsed.data);
  await logAudit("settings.general_updated", "settings", null, parsed.data);
  return NextResponse.json({ ok: true });
}
