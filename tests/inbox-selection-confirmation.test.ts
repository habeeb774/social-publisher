import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmCurrentSelection } from "../src/app/inbox/selection-confirmation";

test("confirmation permits only an explicitly confirmed current selection", async () => {
  assert.equal(await confirmCurrentSelection(1, () => 1, async () => true), true);
  assert.equal(await confirmCurrentSelection(1, () => 1, async () => false), false);
  let asked = false;
  assert.equal(await confirmCurrentSelection(1, () => 2, async () => { asked = true; return true; }), false);
  assert.equal(asked, false);
});

test("navigation or unmount during confirmation cancels the old thread's action", async () => {
  let current = 1;
  let finish!: (confirmed: boolean) => void;
  const answer = new Promise<boolean>(resolve => { finish = resolve; });
  const result = confirmCurrentSelection(1, () => current, () => answer);
  ++current;
  finish(true);
  assert.equal(await result, false);
});
