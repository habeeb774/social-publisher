import assert from "node:assert/strict";
import test from "node:test";
import { postInputSchema, classifyFacebookError } from "../src/services/posts";

test("post validation accepts a scheduled post", () => {
  const result = postInputSchema.parse({ pageId: "page-1", content: "مرحبا", scheduledAt: "2030-01-01T10:00:00Z", status: "scheduled" });
  assert.equal(result.pageId, "page-1");
});

test("permanent Facebook errors are not retryable", () => {
  assert.equal(classifyFacebookError("OAuth token expired").retryable, false);
  assert.equal(classifyFacebookError("temporary network timeout").retryable, true);
});
