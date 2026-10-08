import test from "node:test";
import assert from "node:assert/strict";
import { createWebhookWorker, type WebhookClaim } from "../src/services/meta-webhook-worker";

test("durable worker claims sequentially, counts partial failures as review and stops on empty queue", async () => {
  const events: string[] = [];
  let claimed = 0;
  const finishes: Array<[string, string, boolean]> = [];
  const worker = createWebhookWorker({
    recover: async () => { events.push("recover"); },
    claim: async token => { events.push("claim"); assert.match(token, /^[a-f0-9-]{36}$/); claimed++; return claimed <= 2 ? { id: String(claimed), claim_token: token, payload: { failed: claimed - 1 } } : null; },
    process: async payload => { events.push("process"); return { failed: Number(payload.failed) }; },
    finish: async (id, token, success) => { events.push("finish"); finishes.push([id, token, success]); return true; },
  });
  assert.deepEqual(await worker(), { completed: 1, needsReview: 1, lostClaim: 0 });
  assert.deepEqual(events, ["recover", "claim", "process", "finish", "claim", "process", "finish", "claim"]);
  assert.deepEqual(finishes.map(([id, , ok]) => [id, ok]), [["1", true], ["2", false]]);
});

test("processing exceptions retain no raw error data and finish only the owned claim", async t => {
  const logger = t.mock.method(console, "error", () => {});
  const claim: WebhookClaim = { id: "id", claim_token: "owned-token", payload: {} };
  const worker = createWebhookWorker({ recover: async () => {}, claim: async () => claim,
    process: async () => { throw new Error("private message and token"); },
    finish: async (id, token, success) => { assert.equal(id, "id"); assert.equal(token, "owned-token"); assert.equal(success, false); return false; },
  });
  assert.deepEqual(await worker(1), { completed: 0, needsReview: 0, lostClaim: 1 });
  assert.deepEqual(logger.mock.calls[0].arguments, ["Meta webhook worker processing failed", { code: "META_WEBHOOK_PROCESS_FAILED" }]);
});

test("completion database failure never causes in-process replay", async () => {
  let calls = 0;
  const worker = createWebhookWorker({ recover: async () => {}, claim: async token => ({ id: "id", payload: {}, claim_token: token }),
    process: async () => { calls++; return { failed: 0 }; }, finish: async () => { throw new Error("persistence failed"); },
  });
  await assert.rejects(worker(), /persistence failed/); assert.equal(calls, 1);
});

test("invalid batch limits fail before recovery or claiming", async () => {
  const worker = createWebhookWorker({ recover: async () => { assert.fail("must not recover"); }, claim: async () => null, process: async () => ({ failed: 0 }), finish: async () => true });
  for (const limit of [0, -1, 21, 1.5, NaN]) await assert.rejects(worker(limit), /INVALID_WEBHOOK_BATCH_LIMIT/);
});
