import { test } from "node:test";
import assert from "node:assert/strict";
import { draftAfterOpening } from "../src/app/inbox/reply-draft";

test("detail refresh and retry preserve the current thread's unsent reply", () => {
  const thread = { kind: "comment" as const, id: "one" };
  assert.equal(draftAfterOpening(thread, thread, "رد قيد الكتابة"), "رد قيد الكتابة");
  assert.equal(draftAfterOpening(thread, { ...thread }, "  نص  "), "  نص  ");
});

test("confirmed submission clears its draft while different threads never inherit it", () => {
  const thread = { kind: "messenger" as const, id: "one" };
  assert.equal(draftAfterOpening(thread, thread, "reply", true), "");
  assert.equal(draftAfterOpening(thread, { ...thread, id: "two" }, "reply"), "");
  assert.equal(draftAfterOpening(thread, { kind: "comment", id: "one" }, "reply"), "");
  assert.equal(draftAfterOpening(null, thread, "reply"), "");
});
