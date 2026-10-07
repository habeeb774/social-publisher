import { test } from "node:test";
import assert from "node:assert/strict";
import { refreshCurrentSelection } from "../src/app/inbox/selection-refresh";

test("completed inbox writes refresh only the initiating selection", async () => {
  let generation = 3;
  let refreshes = 0;
  const refresh = async () => { ++refreshes; };
  assert.equal(await refreshCurrentSelection(3, () => generation, refresh), true);
  assert.equal(refreshes, 1);
  generation = 4; // Another thread, back navigation, source change, or unmount.
  assert.equal(await refreshCurrentSelection(3, () => generation, refresh), false);
  assert.equal(refreshes, 1);
});

test("selection changes while an inbox write is pending cannot reopen its old thread", async () => {
  let generation = 1;
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  let reopened = false;
  const request = generation;
  const write = async () => {
    await pending;
    return refreshCurrentSelection(request, () => generation, async () => { reopened = true; });
  };
  const result = write();
  ++generation;
  finish();
  assert.equal(await result, false);
  assert.equal(reopened, false);
});
