import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { convertMessengerLead } from "../src/app/inbox/messages/lead-conversion";

test("conversion validates the returned lead ID and performs one write without retry", async () => {
  const original = globalThis.fetch;
  const conversation = randomUUID(), lead = randomUUID();
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++; assert.equal(url, "/api/leads/from-messenger");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { conversationId: conversation });
    return Response.json({ id: lead, status: "new" });
  };
  try { assert.equal(await convertMessengerLead(conversation), lead); assert.equal(calls, 1); }
  finally { globalThis.fetch = original; }
});

test("invalid conversion results cannot become success links", async () => {
  const original = globalThis.fetch;
  try {
    for (const result of [{}, { id: "../../settings" }, { id: "javascript:alert(1)" }]) {
      globalThis.fetch = async () => Response.json(result);
      await assert.rejects(convertMessengerLead(randomUUID()), /لم يتأكد التحويل/);
    }
  } finally { globalThis.fetch = original; }
});
