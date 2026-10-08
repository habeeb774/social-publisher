import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/** Internal worker: authenticate before opening the database or processing payloads. */
export function createWebhookWorkerHandler(deps: {
  secret: () => string | undefined;
  run: () => Promise<unknown>;
}) {
  return async (request: Request) => {
    const headers = { "Cache-Control": "private, no-store" };
    const expected = deps.secret() ?? "";
    const actual = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401, headers });
    }
    try {
      const result = await deps.run();
      return NextResponse.json({ result }, { headers });
    } catch {
      console.error("Meta webhook worker unavailable", { code: "META_WEBHOOK_WORKER_FAILED" });
      return NextResponse.json({ error: "تعذرت معالجة الأحداث، حاول لاحقًا" }, { status: 503, headers });
    }
  };
}
