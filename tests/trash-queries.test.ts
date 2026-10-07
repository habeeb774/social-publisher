import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { purgePostsQuery } from "../src/services/trash-queries";

const id="58d38e8d-2f0f-4d60-bc11-5e9beddd994d";
const user="09a77e83-d77b-4cc7-86c9-4bac2e8aa122";
test("purge locks scoped never-attempted trashed drafts and atomically deletes dependents",()=>{
  const query=new PgDialect().sqlToQuery(purgePostsQuery([id],{workspaceId:id,userId:user,role:"owner"}));
  for(const fragment of ["MATERIALIZED","FOR UPDATE OF posts","posts.deleted_at IS NOT NULL","posts.status='draft'","NOT EXISTS(SELECT 1 FROM publication_attempts","DELETE FROM post_media","DELETE FROM post_versions","DELETE FROM post_notes","DELETE FROM posts","m.is_active=true","u.is_active=true"])assert.ok(query.sql.includes(fragment),fragment);
  assert.match(query.sql,/wp.page_id="posts"\."page_id"/);
  assert.deepEqual(query.params,[id,user,id,"owner","admin","manager"]);
  assert.ok(!query.sql.includes(id));
  assert.ok(!query.sql.includes(user));
});
test("purge rejects malformed or unbounded targets before executing",()=>{
  for(const ids of [[],["' OR true --"],Array(201).fill(id)])assert.throws(()=>purgePostsQuery(ids));
  assert.ok(new PgDialect().sqlToQuery(purgePostsQuery([id])).sql.includes("AND true FOR UPDATE"));
});
