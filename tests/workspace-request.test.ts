import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { authorizeWorkspace, createWorkspaceAccessHandler, type WorkspaceRequestDependencies } from "../src/services/workspace-request";

const workspaceId = "58d38e8d-2f0f-4d60-bc11-5e9beddd994d";
const userId = "09a77e83-d77b-4cc7-86c9-4bac2e8aa122";
const request = () => new NextRequest(`https://qa.example.test/api/workspaces/${workspaceId}/access`,{headers:{"x-workspace-role":"owner"}});
const route = {params:Promise.resolve({id:workspaceId})};
const deps = ():WorkspaceRequestDependencies => ({user:async()=>({id:userId}),membership:async()=>[{workspace_id:workspaceId,role:"support"}]});

test("workspace route exposes only current membership permissions, never caller role claims", async () => {
  const response = await createWorkspaceAccessHandler(deps())(request(),route);
  assert.equal(response.status,200);
  assert.match(response.headers.get("cache-control")!,/private, no-store/);
  assert.equal(response.headers.get("vary"),"Cookie");
  const body = await response.json();
  assert.equal(body.role,"support");
  assert.ok(body.permissions.includes("messages.reply"));
  assert.ok(!body.permissions.includes("posts.publish"));
  assert.deepEqual(Object.keys(body).sort(),["permissions","role","workspaceId"]);
  const denied = await authorizeWorkspace(request(),workspaceId,deps(),"posts.publish");
  assert.equal(denied.response?.status,403);
});
test("anonymous, invalid and bootstrap identities never query memberships", async () => {
  for (const [identity,id,status] of [[null,workspaceId,401],[{id:"env-admin"},workspaceId,403],[{id:userId},"bad",400]] as const) {
    let queried = false;
    const result = await authorizeWorkspace(request(),id,{user:async()=>identity,membership:async()=>{queried=true;return [];}});
    assert.equal(result.response?.status,status); assert.equal(queried,false);
  }
});
test("missing and mismatched memberships do not grant tenant access", async () => {
  for (const rows of [[],[{workspace_id:userId,role:"owner"}]]) {
    const result = await authorizeWorkspace(request(),workspaceId,{...deps(),membership:async()=>rows});
    assert.equal(result.response?.status,403);
  }
});
test("malformed membership or database failures fail closed without leaking details", async () => {
  for (const membership of [async()=>[{workspace_id:workspaceId,role:"invented"}],async()=>{throw Error("private database token");}]) {
    const result = await authorizeWorkspace(request(),workspaceId,{...deps(),membership});
    assert.equal(result.response?.status,503);
    assert.ok(!(await result.response!.text()).includes("private database token"));
  }
});
