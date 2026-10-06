import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/services/api-guard";
import { metaWebhookHealth, setupMetaWebhook } from "@/services/meta-webhook";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "settings.manage");
  if (denied) return denied;
  return NextResponse.json(await metaWebhookHealth(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const denied = await guard(request, true, "settings.manage");
  if (denied) return denied;
  try {
    return NextResponse.json(await setupMetaWebhook(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "META_WEBHOOK_SETUP_FAILED";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
