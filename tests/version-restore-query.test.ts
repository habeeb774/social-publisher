import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { versionRestoreQuery } from "../src/services/version-restore-query";
const postId="58d38e8d-2f0f-4d60-bc11-5e9beddd994d";
const input={postId,updatedAt:new Date("2026-10-08T10:00:00Z"),content:"private revision",scheduledAt:null,media:[],actor:"QA"};
test("version restoration is one gated statement for snapshot, content and media",()=>{
  const query=new PgDialect().sqlToQuery(versionRestoreQuery(input));
  for(const fragment of ["FOR UPDATE","posts.deleted_at IS NULL","date_trunc('milliseconds'","INSERT INTO post_versions","FROM source","FROM saved","DELETE FROM post_media","SELECT id FROM changed","INSERT INTO post_media","count(*) FROM removed","count(*) FROM inserted","status='draft'::post_status"])assert.ok(query.sql.includes(fragment),fragment);
  assert.ok(!query.sql.includes(input.content));
  assert.ok(query.params.includes(input.content));
});
test("malformed media is rejected before replacing existing media",()=>{
  assert.throws(()=>versionRestoreQuery({...input,media:[{url:null,type:"image"}]}));
  assert.throws(()=>versionRestoreQuery({...input,media:null}));
  assert.throws(()=>versionRestoreQuery({...input,postId:"invalid"}));
});
test("restoration checks current workspace membership rather than trusting the supplied role",()=>{
  const userId="b526a499-09fb-4d32-9f38-50f9e6f687ed";
  const workspaceId="99a567d0-c7d8-4e3f-8957-6b504c349279";
  const dialect=new PgDialect();
  const owner=dialect.sqlToQuery(versionRestoreQuery(input,{userId,workspaceId,role:"owner"}));
  const viewer=dialect.sqlToQuery(versionRestoreQuery(input,{userId,workspaceId,role:"viewer"}));
  assert.equal(owner.sql,viewer.sql);
  assert.deepEqual(owner.params,viewer.params);
  for(const fragment of ["workspace_pages","workspace_members","m.is_active=true","u.is_active=true","w.is_active=true","fp.is_active=true","wp.workspace_id=","m.role IN"]){
    assert.ok(owner.sql.includes(fragment),fragment);
  }
  assert.ok(owner.params.includes(userId));
  assert.ok(owner.params.includes(workspaceId));
  assert.ok(owner.params.includes("editor"));
  assert.ok(!owner.params.includes("viewer"));
  assert.ok(!owner.params.includes("support"));
  assert.throws(()=>versionRestoreQuery(input,{userId:"invalid",workspaceId,role:"owner"}));
});
