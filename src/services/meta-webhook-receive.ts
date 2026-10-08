import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

type Dependencies = {
  verify: (raw: string, signature: string | null) => boolean;
  persist: (delivery: { digest: string; payload: Record<string, unknown> }) => Promise<void>;
  wake: () => void;
};

/** A durable receiver acknowledges only committed storage, never an in-memory task. */
export function createMetaWebhookReceiver(deps: Dependencies) {
  return async (request: NextRequest) => {
    const headers = { "Cache-Control": "no-store" };
    const raw = await request.text();
    if (!deps.verify(raw, request.headers.get("x-hub-signature-256") ?? request.headers.get("x-hub-signature"))) {
      return NextResponse.json({ error: "توقيع غير صالح" }, { status: 401, headers });
    }
    let payload: unknown;
    try { payload = JSON.parse(raw); }
    catch { return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400, headers }); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400, headers });
    }
    try {
      await deps.persist({ digest: createHash("sha256").update(raw).digest("hex"), payload: payload as Record<string, unknown> });
    } catch {
      console.error("Meta webhook persistence unavailable", { code: "META_WEBHOOK_PERSIST_FAILED" });
      return NextResponse.json({ error: "تعذر حفظ الحدث" }, { status: 503, headers });
    }
    // Wake-up is only an optimization; a periodic durable worker must recover it.
    try { deps.wake(); }
    catch { console.error("Meta webhook wake-up unavailable", { code: "META_WEBHOOK_WAKE_FAILED" }); }
    return NextResponse.json({ received: true }, { headers });
  };
}
