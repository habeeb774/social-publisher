import assert from "node:assert/strict";
import { isPublishingEnabled } from "../src/services/publishing-mode";
import { createSessionToken, verifySessionToken } from "../src/services/request-auth";
import test from "node:test";
import { postInputSchema, classifyFacebookError } from "../src/services/posts";
import { publishToFacebook } from "../src/services/facebook";

test("post validation accepts a scheduled post", () => {
  const result = postInputSchema.parse({ pageId: "page-1", content: "مرحبا", scheduledAt: "2030-01-01T10:00:00Z", status: "scheduled" });
  assert.equal(result.pageId, "page-1");
});

test("permanent Facebook errors are not retryable", () => {
  assert.equal(classifyFacebookError("OAuth token expired").retryable, false);
  assert.equal(classifyFacebookError("temporary network timeout").retryable, true);
});

test("safe mode verifies MCP discovery without executing a write action", async () => {
  const previous = process.env.PUBLISHING_ENABLED;
  const previousKey = process.env.WINDSOR_API_KEY;
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  process.env.PUBLISHING_ENABLED = "false";
  process.env.WINDSOR_API_KEY = "test-only";
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    methods.push(request.params?.name || request.method);
    assert.notEqual(request.params?.name, "execute_action");
    const result = request.params?.name === "get_connectors" ? {structuredContent:{result:[{id:"facebook_organic",accounts:[{id:"page-1"}]}]}} : request.params?.name === "list_actions" ? {structuredContent:{result:[{id:"create_post"},{id:"create_photo_post"}]}} : {};
    return new Response(JSON.stringify({jsonrpc:"2.0",id:request.id,result}),{status:200});
  };
  try {
  const result = await publishToFacebook({ pageId: "page-1", content: "اختبار آمن" });
  assert.equal(result.dryRun, true);
  assert.equal(result.provider, "facebook_mcp");
  assert.ok(methods.includes("list_actions"));
  assert.ok(methods.includes("get_connectors"));
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.PUBLISHING_ENABLED; else process.env.PUBLISHING_ENABLED = previous;
    if (previousKey === undefined) delete process.env.WINDSOR_API_KEY; else process.env.WINDSOR_API_KEY = previousKey;
  }
});

test("admin session cookie is signed and rejects forged values", async () => {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-secret";
  try {
    const token = await createSessionToken();
    assert.equal(await verifySessionToken(token), true);
    assert.equal(await verifySessionToken("authenticated"), false);
    assert.equal(await verifySessionToken(token + ".extra"), false);
    assert.equal(await verifySessionToken(token.replace(/v1\.\d+/, "v1.NaN")), false);
    assert.equal(await verifySessionToken(await createSessionToken(Date.now() + 3600 * 1000)), false);
    assert.equal(await verifySessionToken(token.slice(0, -1) + (token.endsWith("0") ? "1" : "0")), false);
    assert.equal(await verifySessionToken(await createSessionToken(Date.now() - 9 * 3600 * 1000)), false);
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previous;
  }
});

test("publishing flag tolerates dashboard formatting", () => {
  const previous = process.env.PUBLISHING_ENABLED;
  try {
    for (const value of ["true", " true ", "True", "\"true\""]) { process.env.PUBLISHING_ENABLED = value; assert.equal(isPublishingEnabled(), true); }
    for (const value of ["false", "", "yes"]) { process.env.PUBLISHING_ENABLED = value; assert.equal(isPublishingEnabled(), false); }
  } finally {
    if (previous === undefined) delete process.env.PUBLISHING_ENABLED; else process.env.PUBLISHING_ENABLED = previous;
  }
});
