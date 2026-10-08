import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createMetaWebhookReceiver } from "../src/services/meta-webhook-receive";

const request = (raw = '{"object":"page","entry":[]}') => new NextRequest("https://qa.example.test/api/meta/webhook", { method: "POST", body: raw });

test("webhook acknowledgement waits for durable persistence before wake-up", async () => {
  const events: string[] = [];
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const receive = createMetaWebhookReceiver({ verify: () => true, persist: async data => {
    assert.match(data.digest, /^[a-f0-9]{64}$/);
    assert.equal(data.payload.object, "page");
    events.push("persisting"); await barrier; events.push("committed");
  }, wake: () => { events.push("wake"); } });
  let settled = false;
  const pending = receive(request()).then(response => { settled = true; return response; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(events, ["persisting"]); assert.equal(settled, false);
  release();
  const response = await pending;
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(events, ["persisting", "committed", "wake"]);
});

test("storage failure cannot acknowledge or wake processing and does not expose diagnostics", async t => {
  t.mock.method(console, "error", () => {});
  let woke = false;
  const receive = createMetaWebhookReceiver({ verify: () => true, persist: async () => { throw new Error("private SQL parameters"); }, wake: () => { woke = true; } });
  const response = await receive(request());
  assert.equal(response.status, 503); assert.equal(woke, false);
  assert.equal((await response.text()).includes("private"), false);
});

test("invalid signatures and malformed payloads never reach storage", async () => {
  let writes = 0;
  const deps = { verify: () => true, persist: async () => { writes++; }, wake: () => {} };
  assert.equal((await createMetaWebhookReceiver({ ...deps, verify: () => false })(request())).status, 401);
  for (const raw of ["{", "null", "[]", '"text"']) assert.equal((await createMetaWebhookReceiver(deps)(request(raw))).status, 400);
  assert.equal(writes, 0);
});

test("committed events remain acknowledged when optional wake-up fails", async t => {
  t.mock.method(console, "error", () => {});
  const receive = createMetaWebhookReceiver({ verify: () => true, persist: async () => {}, wake: () => { throw new Error("wake failed"); } });
  assert.equal((await receive(request())).status, 200);
});
