import test from "node:test";
import assert from "node:assert/strict";
import { pageChangeState } from "../src/services/post-page-change";

test("changing publishing destination clears approval and all pending scheduling state", () => {
  for (const status of ["draft", "scheduled", "approved", "pending_approval", "failed"]) {
    const moved = Object.assign({ status, scheduledAt: new Date(), inQueue: true, queueOrder: 3, failedAt: new Date(), lastError: "old failure" }, pageChangeState());
    assert.deepEqual(moved, { status: "draft", scheduledAt: null, inQueue: false, queueOrder: null, failedAt: null, lastError: null });
  }
});
