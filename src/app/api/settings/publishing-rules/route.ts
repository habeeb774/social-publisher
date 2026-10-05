import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { recomputeQueue } from "@/services/post-ops";
import { getPublishingRules } from "@/services/rules-store";
import { setSetting } from "@/services/settings-store";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const body = z.object({ window: z.object({ enabled: z.boolean(), start: time, end: time, mode: z.enum(["warn", "shift"]) }), quietWeekdays: z.array(z.number().int().min(0).max(6)).max(7), quietDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366) });

export async function GET(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  return NextResponse.json(await getPublishingRules());
}
/** Saves rules and reflows the queue so queued posts move out of newly blocked times. */
export async function PUT(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "إعدادات غير صالحة" }, { status: 400 });
  if (parsed.data.window.enabled && parsed.data.window.start === parsed.data.window.end) return NextResponse.json({ error: "البداية والنهاية متساويتان" }, { status: 400 });
  await setSetting("publishing_rules", { ...parsed.data, quietDates: [...new Set(parsed.data.quietDates)].sort() });
  await recomputeQueue();
  await logAudit("settings.publishing_rules_updated", "settings", null, parsed.data);
  return NextResponse.json({ ok: true });
}
