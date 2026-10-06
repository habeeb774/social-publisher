import { after, NextRequest, NextResponse } from "next/server";
import {
  processMetaWebhook,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "@/services/meta-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  if (!challenge || !verifyMetaWebhookChallenge(mode, token)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? request.headers.get("x-hub-signature");
  if (!verifyMetaWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  after(async () => {
    try { await processMetaWebhook(payload as Parameters<typeof processMetaWebhook>[0]); }
    catch (error) { console.error("Meta webhook processing failed", { error: error instanceof Error ? error.message : String(error) }); }
  });

  return NextResponse.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
}
