import assert from "node:assert/strict";
import { isPublishingEnabled } from "../src/services/publishing-mode";
import { createSessionToken, verifySessionToken } from "../src/services/request-auth";
import test from "node:test";
import { postInputSchema, classifyFacebookError } from "../src/services/posts";
import { publishToFacebook } from "../src/services/facebook";
import { isoToRiyadhInput, riyadhInputToIso } from "../src/services/post-time";

test("scheduled posts require a future date and explicit Riyadh timezone",()=>{
  const base={pageId:"page-1",content:"مرحبا",status:"scheduled"};
  assert.equal(postInputSchema.safeParse(base).success,false);
  assert.equal(postInputSchema.safeParse({...base,scheduledAt:"2000-01-01T00:00:00Z"}).success,false);
  assert.equal(postInputSchema.safeParse({...base,scheduledAt:"2030-01-01T00:00:00Z",timezone:"UTC"}).success,false);
  assert.equal(riyadhInputToIso("2030-01-01T00:30"),"2029-12-31T21:30:00.000Z");
  assert.equal(isoToRiyadhInput("2029-12-31T21:30:00.000Z"),"2030-01-01T00:30");
});

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

test("page access token routes publishing through the Graph API", async () => {
  const saved = { token: process.env.META_PAGE_ACCESS_TOKEN, flag: process.env.PUBLISHING_ENABLED };
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  process.env.META_PAGE_ACCESS_TOKEN = "test-token";
  process.env.PUBLISHING_ENABLED = "true";
  globalThis.fetch = async (url, init) => {
    const href = String(url); calls.push(`${init?.method ?? "GET"} ${href.split("?")[0]}`);
    if (href.includes("fields=access_token")) return new Response(JSON.stringify({ access_token: "page-token", id: "page-1" }));
    if (init?.method === "POST") return new Response(JSON.stringify({ id: "page-1_99" }));
    return new Response(JSON.stringify({ permalink_url: "https://facebook.com/page-1/posts/99" }));
  };
  try {
    const result = await publishToFacebook({ pageId: "page-1", content: "اختبار" });
    assert.equal(result.id, "page-1_99");
    assert.equal(result.provider, "facebook_graph");
    assert.equal(result.permalink, "https://facebook.com/page-1/posts/99");
    assert.ok(calls.some(call => call.startsWith("POST") && call.endsWith("/page-1/feed")));
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 200, message: "denied" } }), { status: 403 });
    await assert.rejects(publishToFacebook({ pageId: "page-1", content: "x" }), /FACEBOOK_GRAPH_ERROR: \(#200\) denied/);
  } finally {
    globalThis.fetch = originalFetch;
    if (saved.token === undefined) delete process.env.META_PAGE_ACCESS_TOKEN; else process.env.META_PAGE_ACCESS_TOKEN = saved.token;
    if (saved.flag === undefined) delete process.env.PUBLISHING_ENABLED; else process.env.PUBLISHING_ENABLED = saved.flag;
  }
});

test("alerts never throw when the database is unavailable", async () => {
  const { sendAlert } = await import("../src/services/alerts");
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const result = await sendAlert("publish_failed", "t", "m");
    assert.equal(result.sent, false);
  } finally { if (saved !== undefined) process.env.DATABASE_URL = saved; }
});
