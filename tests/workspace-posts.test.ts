import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { encodeCommentCursor } from "../src/services/comments/filters";
import { createWorkspacePostListHandler, parseWorkspacePostPage, workspacePostEditPredicate } from "../src/services/workspace-posts";
import { PgDialect } from "drizzle-orm/pg-core";

const workspace="58d38e8d-2f0f-4d60-bc11-5e9beddd994d", user="09a77e83-d77b-4cc7-86c9-4bac2e8aa122";
test("workspace edit predicate correlates target page and uses current database membership", () => {
  const query=new PgDialect().sqlToQuery(workspacePostEditPredicate({userId:user,workspaceId:workspace,role:"owner"}));
  assert.match(query.sql,/wp\.page_id="posts"\."page_id"/);
  for(const fragment of ["w.is_active=true","fp.is_active=true","m.is_active=true","u.is_active=true","m.role IN"])assert.ok(query.sql.includes(fragment));
  assert.deepEqual(query.params,[user,workspace,"owner","admin","manager","editor"]);
  assert.deepEqual(new PgDialect().sqlToQuery(workspacePostEditPredicate({userId:user,workspaceId:workspace,role:"owner"},true)).params,[user,workspace,"owner","admin","manager"]);
  assert.ok(!query.sql.includes(user));assert.ok(!query.sql.includes(workspace));
  assert.throws(()=>workspacePostEditPredicate({userId:"env-admin",workspaceId:workspace,role:"owner"}));
  assert.throws(()=>workspacePostEditPredicate({userId:user,workspaceId:"' OR true --",role:"owner"}));
});
test("workspace post paging rejects unbounded or malformed input and preserves timestamp precision", () => {
  for(const query of ["limit=0","limit=101","limit=2.5","limit=Infinity","cursor=garbage",`cursor=${"x".repeat(1025)}`])assert.throws(()=>parseWorkspacePostPage(new URLSearchParams(query)));
  const time="2026-10-07T01:00:00.123456Z";
  const parsed=parseWorkspacePostPage(new URLSearchParams({cursor:encodeCommentCursor(time,user),limit:"2"}));
  assert.deepEqual(parsed,{limit:2,cursor:{time,id:user}});
});
test("workspace post handler denies absent membership before reading content", async () => {
  let read=false;
  const handler=createWorkspacePostListHandler({user:async()=>({id:user}),membership:async()=>[],read:async()=>{read=true;return [];}});
  const response=await handler(new NextRequest("https://qa.example.test/api/posts"),workspace);
  assert.equal(response.status,403);assert.equal(read,false);
});
test("workspace post responses strip private fields and do not leak database errors", async () => {
  const dependencies={user:async()=>({id:user}),membership:async()=>[{workspace_id:workspace,role:"viewer"}]};
  const row={id:user,pageId:workspace,content:"QA",status:"draft",createdAt:"2026-10-07T01:00:00.123456Z",updatedAt:"2026-10-07T01:00:00.123456Z",scheduledAt:null,publishedAt:null,lastError:"private provider details"};
  const response=await createWorkspacePostListHandler({...dependencies,read:async()=>[row]})(new NextRequest("https://qa.example.test/api/posts"),workspace);
  assert.equal(response.status,200);assert.ok(!(await response.text()).includes("private provider details"));
  assert.match(response.headers.get("cache-control")!,/private, no-store/);
  const failed=await createWorkspacePostListHandler({...dependencies,read:async()=>{throw Error("private database credential");}})(new NextRequest("https://qa.example.test/api/posts"),workspace);
  assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes("private database credential"));
});
