import { sql } from "drizzle-orm";
import { posts } from "../db/schema";

/** A normal note cannot change the review decision; newer approvals supersede old returns. */
export function latestReviewActionQuery() {
  return sql<string | null>`(select a.action from activity_logs a
    where a.entity_id = ${posts.id} and a.entity_type = 'post'
      and a.action in ('post.submitted','post.approved','post.rejected','post.changes_requested')
    order by a.created_at desc, a.id desc limit 1)`;
}

export function returnedReviewColumn(action: string | null) {
  if (action === "post.changes_requested") return "changes";
  if (action === "post.rejected") return "rejected";
  return null;
}
