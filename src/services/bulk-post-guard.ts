import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { posts } from "../db/schema";
import { bulkPostPermissions, type BulkPostAction } from "./bulk-post-permissions";
import { workspacePostPermissionPredicate } from "./workspace-posts";
import type { WorkspaceContext } from "./workspace-request";

export function bulkPostGuard(post: { id: string; updatedAt: Date }, statuses: Array<typeof posts.$inferSelect.status>, action: BulkPostAction, workspace?: WorkspaceContext) {
  return and(eq(posts.id, post.id), isNull(posts.deletedAt), inArray(posts.status, statuses),
    sql`date_trunc('milliseconds',${posts.updatedAt})=${post.updatedAt.toISOString()}::timestamptz`,
    workspace ? workspacePostPermissionPredicate(workspace, bulkPostPermissions(action)) : undefined);
}
