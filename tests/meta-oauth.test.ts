import assert from "node:assert/strict";
import test from "node:test";
import { createMetaState, metaAuthorizationUrl, verifyMetaState } from "../src/services/meta-oauth";

test("Messenger permission requests stay out of core login and purpose cannot be tampered with", () => {
  const oldId = process.env.META_APP_ID;
  const oldSecret = process.env.AUTH_SECRET;
  try {
    process.env.META_APP_ID = "test-app";
    process.env.AUTH_SECRET = "test-signing-secret";
    const core = new URL(metaAuthorizationUrl("https://example.com/callback", createMetaState()));
    assert.ok(!core.searchParams.get("scope")!.split(",").includes("pages_messaging"));
    const state = createMetaState("/pages", "messenger");
    const messenger = new URL(metaAuthorizationUrl("https://example.com/callback", state, "messenger"));
    assert.ok(messenger.searchParams.get("scope")!.split(",").includes("pages_messaging"));
    assert.ok(!messenger.searchParams.get("scope")!.includes("pages_manage_posts"));
    assert.equal(verifyMetaState(state)?.purpose, "messenger");
    const [payload, signature] = state.split(".");
    const changed = JSON.parse(Buffer.from(payload, "base64url").toString());
    delete changed.purpose;
    assert.equal(verifyMetaState(`${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${signature}`), null);
  } finally {
    if (oldId === undefined) delete process.env.META_APP_ID; else process.env.META_APP_ID = oldId;
    if (oldSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = oldSecret;
  }
});
