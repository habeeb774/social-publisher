import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import {
  deleteMessengerAutomationRule,
  listMessengerAutomationRules,
  messengerAutomationEnabled,
  messengerRuleSchema,
  saveMessengerAutomationRule,
  setMessengerAutomationEnabled,
} from "@/services/messenger-automation";
import { messengerCatalog } from "@/services/messenger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "automation.manage");
  if (denied) return denied;
  const [enabled, rules, catalog] = await Promise.all([
    messengerAutomationEnabled(),
    listMessengerAutomationRules(),
    messengerCatalog(),
  ]);
  return NextResponse.json({ enabled, rules, catalog }, { headers: { "Cache-Control": "no-store" } });
}

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("toggle"), enabled: z.boolean() }),
  z.object({ action: z.literal("save"), id: z.uuid().optional(), input: messengerRuleSchema.omit({ id: true }) }),
  z.object({ action: z.literal("delete"), id: z.uuid() }),
]);

export async function POST(request: NextRequest) {
  const denied = await guard(request, true, "automation.manage");
  if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });

  try {
    if (parsed.data.action === "toggle") return NextResponse.json(await setMessengerAutomationEnabled(parsed.data.enabled));
    if (parsed.data.action === "delete") return NextResponse.json(await deleteMessengerAutomationRule(parsed.data.id));
    return NextResponse.json(await saveMessengerAutomationRule(parsed.data.input, parsed.data.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "MESSENGER_AUTOMATION_FAILED";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
