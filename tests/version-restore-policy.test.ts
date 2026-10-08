import test from "node:test";
import assert from "node:assert/strict";
import { versionRestoreState } from "../src/services/version-restore-policy";

test("restored revisions never inherit approval, scheduled execution or queue membership", () => {
  const now = Date.parse("2026-10-08T10:00:00Z");
  const future = new Date(now + 120000);
  assert.deepEqual(versionRestoreState(future, now), { status: "draft", inQueue: false, scheduledAt: future });
  for (const date of [null, new Date(now - 1), new Date(now + 60000), new Date("invalid")])
    assert.deepEqual(versionRestoreState(date, now), {status:"draft", inQueue:false, scheduledAt:null});
});
