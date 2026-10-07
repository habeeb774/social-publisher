import assert from "node:assert/strict";
import test from "node:test";
import { savedRuleId } from "../src/app/inbox/rule-save-result";

const id = "58d38e8d-2f0f-4d60-bc11-5e9beddd994d";
test("created rule identity is retained for subsequent updates", () => {
  const created = savedRuleId({ id, name: "قاعدة" }, null);
  assert.equal(created, id);
  assert.equal(savedRuleId({ id: created }, created), id);
});
test("invalid or mismatched save responses cannot replace editor identity", () => {
  for (const result of [null, {}, { id: "bad" }, { id: "09a77e83-d77b-4cc7-86c9-4bac2e8aa122" }]) {
    assert.throws(() => savedRuleId(result, id), /RULE_SAVE_UNCONFIRMED/);
  }
});
