import test from "node:test";
import assert from "node:assert/strict";
import { postRetryUnavailable } from "../src/services/post-retry-response";

test("retry failure returns a private Arabic error and logs only a fixed diagnostic code", async (t) => {
  const logger = t.mock.method(console, "error", () => {});
  const response = postRetryUnavailable();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    error: "تعذر إعادة المحاولة. حدّث حالة المنشور قبل المحاولة مجددًا.",
    code: "POST_RETRY_UNAVAILABLE",
  });
  assert.equal(logger.mock.callCount(), 1);
  assert.deepEqual(logger.mock.calls[0].arguments, ["Post retry unavailable", { code: "POST_RETRY_UNAVAILABLE" }]);
});
