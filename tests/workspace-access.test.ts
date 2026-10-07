import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_ROLES, WORKSPACE_PERMISSIONS, workspaceCan, workspaceMembershipQuery, workspacePagesQuery } from "../src/services/workspace-access";

test("workspace roles keep authoring, publishing and support separate", () => {
  assert.equal(WORKSPACE_ROLES.length, 7);
  for (const permission of Object.keys(WORKSPACE_PERMISSIONS) as Array<keyof typeof WORKSPACE_PERMISSIONS>) {
    assert.equal(workspaceCan("owner", permission), true);
    assert.equal(workspaceCan(null, permission), false);
    assert.equal(workspaceCan("reviewer", permission), false);
    assert.equal(workspaceCan("invented", permission), false);
  }
  assert.equal(workspaceCan("editor", "posts.create"), true);
  assert.equal(workspaceCan("editor", "posts.publish"), false);
  assert.equal(workspaceCan("publisher", "posts.publish"), true);
  assert.equal(workspaceCan("publisher", "team.manage"), false);
  assert.equal(workspaceCan("support", "messages.reply"), true);
  assert.equal(workspaceCan("support", "posts.publish"), false);
  for (const permission of Object.keys(WORKSPACE_PERMISSIONS) as Array<keyof typeof WORKSPACE_PERMISSIONS>) {
    if (!permission.endsWith(".read")) assert.equal(workspaceCan("viewer", permission), false);
  }
});
test("workspace queries reject missing IDs and bootstrap global administrator", () => {
  const id = "58d38e8d-2f0f-4d60-bc11-5e9beddd994d";
  for (const query of [workspaceMembershipQuery, workspacePagesQuery]) {
    assert.throws(() => query("env-admin", id));
    assert.throws(() => query(id, ""));
    assert.throws(() => query(id, "' OR true --"));
  }
});
