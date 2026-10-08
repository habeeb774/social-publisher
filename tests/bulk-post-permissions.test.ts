import test from "node:test";
import assert from "node:assert/strict";
import { bulkPostPermissions } from "../src/services/bulk-post-permissions";
import { workspaceCan } from "../src/services/workspace-access";

test("bulk scheduling and deletion use distinct workspace permissions", () => {
  const allowed = (role: Parameters<typeof workspaceCan>[0], action: Parameters<typeof bulkPostPermissions>[0]) =>
    bulkPostPermissions(action).every(permission => workspaceCan(role, permission));
  assert.equal(allowed("editor", "to_draft"), true);
  assert.equal(allowed("editor", "schedule"), false);
  assert.equal(allowed("editor", "delete_drafts"), false);
  assert.equal(allowed("editor", "archive"), false);
  assert.equal(allowed("publisher", "schedule"), false);
  for (const action of ["schedule", "to_draft", "unschedule", "archive", "delete_drafts", "change_page", "assign_campaign"] as const) {
    assert.equal(allowed("manager", action), true);
    assert.equal(allowed("viewer", action), false);
    assert.equal(allowed("support", action), false);
  }
});
