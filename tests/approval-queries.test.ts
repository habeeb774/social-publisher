import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { rejectPostQuery } from "../src/services/approval-queries";

const id = "58d38e8d-2f0f-4d60-bc11-5e9beddd994d";
const userId = "09a77e83-d77b-4cc7-86c9-4bac2e8aa122";
test("rejection and review note share one scoped atomic statement", () => {
  const query = new PgDialect().sqlToQuery(rejectPostQuery(id, "سبب خاص", "changes", "QA", {workspaceId:id,userId,role:"viewer"}));
  for (const fragment of ["UPDATE posts", "posts.status='pending_approval'", "posts.deleted_at IS NULL", "INSERT INTO post_notes", "FROM changed", "JOIN note_saved", "m.is_active=true", "u.is_active=true"]) assert.ok(query.sql.includes(fragment), fragment);
  assert.match(query.sql, /wp.page_id="posts"\."page_id"/);
  assert.ok(!query.sql.includes("سبب خاص"));
  assert.ok(query.params.includes("طلب تعديل: سبب خاص"));
  assert.deepEqual(query.params.filter(value=>["owner","admin","manager","editor","viewer"].includes(String(value))), ["owner","admin","manager"]);
});
test("rejection query validates identifiers and bounded reasons", () => {
  assert.throws(()=>rejectPostQuery("invalid", "", "rejected", "QA"));
  assert.throws(()=>rejectPostQuery(id, "x".repeat(1001), "rejected", "QA"));
  const query = new PgDialect().sqlToQuery(rejectPostQuery(id, "  ", "rejected", "QA"));
  assert.ok(query.params.includes("رُفض: بدون سبب"));
});
