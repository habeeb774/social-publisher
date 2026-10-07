import { test } from "node:test";
import assert from "node:assert/strict";
import { inboxJson } from "../src/app/inbox/inbox-request";

test("inbox reads are bounded and uncached; writes are never automatically retried", async () => {
  const original = globalThis.fetch;
  const calls: RequestInit[] = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init ?? {});
    return Response.json({ ok: true });
  };
  try {
    assert.deepEqual(await inboxJson("/api/inbox"), { ok: true });
    assert.ok(calls[0].signal instanceof AbortSignal);
    assert.equal(calls[0].cache, "no-store");
    await inboxJson("/api/messages", { method: "POST", body: "{}" });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].signal, undefined);
    assert.equal(calls[1].body, "{}");
  } finally { globalThis.fetch = original; }
});

test("inbox errors never surface arbitrary server payloads", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: "private database detail" }, { status: 503 });
  try {
    await assert.rejects(inboxJson("/api/inbox"), { message: "تعذر التنفيذ. حاول مرة أخرى." });
  } finally { globalThis.fetch = original; }
});
