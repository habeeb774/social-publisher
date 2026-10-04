import assert from "node:assert/strict";
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

test("safe mode returns a dry run without invoking the Facebook provider", async () => {
  const previous = process.env.PUBLISHING_ENABLED;
  process.env.PUBLISHING_ENABLED = "false";
  const result = await publishToFacebook({ pageId: "page-1", content: "اختبار آمن" });
  assert.equal(result.dryRun, true);
  assert.equal(result.provider, "facebook_mcp");
  process.env.PUBLISHING_ENABLED = previous;
});
