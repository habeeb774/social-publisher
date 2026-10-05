import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { setSetting } from "@/services/settings-store";

export async function PUT(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = z.object({ dismissed: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "قيمة غير صالحة" }, { status: 400 });
  await setSetting("onboarding_dismissed", parsed.data.dismissed);
  return NextResponse.json({ ok: true });
}
