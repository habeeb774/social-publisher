import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { evaluateRules, ruleSchema } from "../src/services/comments/rules";
import { verifyMetaWebhookChallenge, verifyMetaWebhookSignature } from "../src/services/meta-webhook";

test("Meta webhook verifies challenge and HMAC signature", () => {
  const oldSecret = process.env.META_APP_SECRET;
  const oldVerify = process.env.META_WEBHOOK_VERIFY_TOKEN;
  try {
    process.env.META_APP_SECRET = "test-meta-secret";
    process.env.META_WEBHOOK_VERIFY_TOKEN = "test-verify-token";
    const raw = JSON.stringify({ object: "page", entry: [] });
    const digest = createHmac("sha256", "test-meta-secret").update(raw).digest("hex");
    assert.equal(verifyMetaWebhookChallenge("subscribe", "test-verify-token"), true);
    assert.equal(verifyMetaWebhookChallenge("subscribe", "wrong"), false);
    assert.equal(verifyMetaWebhookSignature(raw, `sha256=${digest}`), true);
    assert.equal(verifyMetaWebhookSignature(raw, "sha256=deadbeef"), false);
    assert.equal(verifyMetaWebhookSignature(raw, null), false);
  } finally {
    if (oldSecret === undefined) delete process.env.META_APP_SECRET; else process.env.META_APP_SECRET = oldSecret;
    if (oldVerify === undefined) delete process.env.META_WEBHOOK_VERIFY_TOKEN; else process.env.META_WEBHOOK_VERIFY_TOKEN = oldVerify;
  }
});

test("instant comment automation has no artificial delay", () => {
  const parsed = ruleSchema.parse({
    name: "instant",
    active: true,
    operator: "contains",
    keywords: ["سعر"],
    action: "reply_template",
    templateId: "11111111-1111-4111-8111-111111111111",
    delaySeconds: 0,
    requireApproval: false,
    businessHours: false,
  });
  const now = new Date("2026-10-06T12:00:00Z");
  const result = evaluateRules({
    message: "كم سعر المنتج",
    pageId: "page-1",
    postId: "post-1",
    authorId: "user-1",
    isFromPage: false,
    hidden: false,
    replied: false,
  }, [{ ...parsed, id: "rule-1" }], now);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].dueAt.getTime(), now.getTime());
  assert.equal(result.matches[0].rule.requireApproval, false);
});
