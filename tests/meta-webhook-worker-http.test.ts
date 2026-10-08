import test from "node:test";
import assert from "node:assert/strict";
import { createWebhookWorkerHandler } from "../src/services/meta-webhook-worker-http";

test("webhook worker authenticates before processing, including unset and multibyte secrets", async () => {
  let calls = 0;
  for (const secret of [undefined, "worker-secret", "سرّي"]) {
    const handler = createWebhookWorkerHandler({ secret: () => secret, run: async () => { calls++; } });
    for (const authorization of ["", "Bearer incorrect", "Basic worker-secret"]) {
      const result = await handler(new Request("https://example.test", { headers: { authorization } }));
      assert.equal(result.status, 401);
      assert.equal(result.headers.get("cache-control"), "private, no-store");
    }
  }
  assert.equal(calls, 0);
});

test("authenticated worker returns counters without exposing failures", async () => {
  const request = () => new Request("https://example.test", { headers: { authorization: "Bearer worker-secret" } });
  const handler = createWebhookWorkerHandler({ secret: () => "worker-secret", run: async () => ({ completed: 2 }) });
  assert.deepEqual(await (await handler(request())).json(), { result: { completed: 2 } });
  const original = console.error;
  const diagnostics: unknown[][] = [];
  console.error = (...args) => { diagnostics.push(args); };
  try {
    const failed = createWebhookWorkerHandler({ secret: () => "worker-secret", run: async () => { throw new Error("private-token-payload"); } });
    const response = await failed(request());
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private-token-payload/);
    assert.doesNotMatch(JSON.stringify(diagnostics), /private-token-payload/);
  } finally { console.error = original; }
});
