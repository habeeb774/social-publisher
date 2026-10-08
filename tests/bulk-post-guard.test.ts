import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { bulkPostGuard } from "../src/services/bulk-post-guard";

test("bulk writes gate the current revision and current tenant permission together", () => {
  const post = {id:"58d38e8d-2f0f-4d60-bc11-5e9beddd994d",updatedAt:new Date("2026-10-08T10:00:00Z")};
  const workspace = {userId:"b526a499-09fb-4d32-9f38-50f9e6f687ed",workspaceId:"99a567d0-c7d8-4e3f-8957-6b504c349279",role:"owner" as const};
  const predicate = bulkPostGuard(post,["draft"],"schedule",workspace);
  assert.ok(predicate);
  const query = new PgDialect().sqlToQuery(predicate);
  for (const fragment of ["deleted_at", "is null", "date_trunc('milliseconds'", "workspace_pages", "workspace_members", "m.is_active=true", "u.is_active=true", "m.role IN"]) assert.ok(query.sql.includes(fragment),fragment);
  for (const value of [post.id,post.updatedAt.toISOString(),workspace.userId,workspace.workspaceId,"draft","manager"]) assert.ok(query.params.includes(value),value);
  assert.ok(!query.params.includes("editor"));
  assert.ok(!query.params.includes("viewer"));
  assert.ok(!query.sql.includes(post.id));
});

test("page changes reject successful or uncertain attempts in the actual write predicate", () => {
  const post = { id: "58d38e8d-2f0f-4d60-bc11-5e9beddd994d", updatedAt: new Date() };
  const predicate = bulkPostGuard(post, ["failed"], "change_page");
  assert.ok(predicate);
  const query = new PgDialect().sqlToQuery(predicate);
  for (const fragment of ["NOT EXISTS", "publication_attempts", "post_id", "'started'", "'outcome_unknown'", "'success'", "facebook_post_id", "published_at"]) assert.ok(query.sql.includes(fragment), fragment);
  assert.ok(!query.sql.includes("'DRY_RUN_SUCCESS'"));
});
