import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { latestReviewActionQuery, returnedReviewColumn } from "../src/services/review-board";

test("returned review classification uses decisions rather than ordinary note text", () => {
  assert.equal(returnedReviewColumn("post.changes_requested"), "changes");
  assert.equal(returnedReviewColumn("post.rejected"), "rejected");
  for (const action of [null, "post.approved", "post.submitted", "طلب تعديل: ملاحظة", "post.updated"])
    assert.equal(returnedReviewColumn(action), null);
});

test("latest decision query correlates the post, excludes ordinary notes and includes superseding approvals", () => {
  const { sql } = new PgDialect().sqlToQuery(latestReviewActionQuery());
  assert.match(sql, /a.entity_id = "posts"\."id"/);
  assert.match(sql, /a.entity_type = 'post'/);
  assert.match(sql, /'post.submitted','post.approved','post.rejected','post.changes_requested'/);
  assert.match(sql, /order by a.created_at desc, a.id desc limit 1/);
  assert.ok(!sql.includes("post_notes"));
});
