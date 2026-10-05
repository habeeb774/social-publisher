import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { ALERT_TYPES, type AlertPrefs } from "@/services/alerts";
import { logAudit } from "@/services/audit";
import { getSetting, setSetting } from "@/services/settings-store";

const pref = z.object({ inApp: z.boolean(), email: z.boolean() });
const body = z.record(z.enum(Object.keys(ALERT_TYPES) as [keyof typeof ALERT_TYPES]), pref);

export async function GET(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  return NextResponse.json(await getSetting<AlertPrefs>("notification_prefs", {}));
}
export async function PUT(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "إعدادات غير صالحة" }, { status: 400 });
  await setSetting("notification_prefs", parsed.data);
  await logAudit("settings.notifications_updated", "settings", null);
  return NextResponse.json({ ok: true });
}
