import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { posts, publicationAttempts } from "../db/schema";
import { bulkPostPermissions, type BulkPostAction } from "./bulk-post-permissions";
import { workspacePostPermissionPredicate } from "./workspace-posts";
import type { WorkspaceContext } from "./workspace-request";

export function bulkPostGuard(post: { id: string; updatedAt: Date }, statuses: Array<typeof posts.$inferSelect.status>, action: BulkPostAction, workspace?: WorkspaceContext) {
  return and(eq(posts.id, post.id), isNull(posts.deletedAt), inArray(posts.status, statuses),
    sql`date_trunc('milliseconds',${posts.updatedAt})=${post.updatedAt.toISOString()}::timestamptz`,
    action === "change_page" ? and(isNull(posts.facebookPostId), isNull(posts.publishedAt),
      sql`NOT EXISTS (SELECT 1 FROM ${publicationAttempts} WHERE ${publicationAttempts.postId}=${posts.id} AND (${publicationAttempts.status} IN ('started','outcome_unknown','success') OR ${publicationAttempts.facebookPostId} IS NOT NULL))`) : undefined,
    workspace ? workspacePostPermissionPredicate(workspace, bulkPostPermissions(action)) : undefined);
}
