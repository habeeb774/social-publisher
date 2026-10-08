import { sql } from "drizzle-orm";
import { z } from "zod";
import type { WorkspaceContext } from "./workspace-request";
import { workspacePostPermissionPredicate } from "./workspace-posts";

/** A failed note insertion rolls back the status transition as well. */
export function rejectPostQuery(id: string, reason: string, kind: "rejected" | "changes", author: string, workspace?: WorkspaceContext) {
  z.uuid().parse(id);
  z.string().max(1000).parse(reason);
  z.enum(["rejected", "changes"]).parse(kind);
  const permission = workspace ? workspacePostPermissionPredicate(workspace, ["posts.approve"]) : sql`true`;
  const note = `${kind === "changes" ? "طلب تعديل" : "رُفض"}: ${reason.trim() || "بدون سبب"}`;
  return sql`WITH changed AS (
    UPDATE posts SET status='draft'::post_status,
      updated_at=greatest(clock_timestamp(),updated_at+interval '1 millisecond')
    WHERE posts.id=${id}::uuid AND posts.status='pending_approval'
      AND posts.deleted_at IS NULL AND ${permission}
    RETURNING id
  ), note_saved AS (
    INSERT INTO post_notes(post_id,body,author)
    SELECT id,${note},${author} FROM changed RETURNING post_id
  ) SELECT changed.id FROM changed JOIN note_saved ON note_saved.post_id=changed.id`;
}
