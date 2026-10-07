import { and, eq, isNotNull, lt, notExists, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, publicationAttempts } from "@/db/schema";
import { logAudit } from "./audit";
import { type WorkspaceContext } from "./workspace-request";
import { workspacePostPermissionPredicate } from "./workspace-posts";
import { purgePostsQuery } from "./trash-queries";

export const TRASH_DAYS = 30;

/** Only trashed drafts that never had a publication attempt can be purged, so audit history is never lost. */
const purgeable = () => and(isNotNull(posts.deletedAt), eq(posts.status, "draft"), notExists(getDb().select({ id: publicationAttempts.id }).from(publicationAttempts).where(eq(publicationAttempts.postId, posts.id))));

export async function restoreFromTrash(id: string, workspace?: WorkspaceContext) {
  const [row] = await getDb().update(posts).set({ deletedAt: null, updatedAt: sql`greatest(clock_timestamp(),${posts.updatedAt}+interval '1 millisecond')` }).where(and(eq(posts.id, id), isNotNull(posts.deletedAt),workspace?workspacePostPermissionPredicate(workspace,["posts.delete"]):undefined)).returning();
  if (!row) throw new Error("NOT_FOUND");
  await logAudit("post.restored_from_trash", "post", id);
  return row;
}

export async function purgePosts(ids: string[], workspace?: WorkspaceContext) {
  if(!ids.length)return 0;
  const db = getDb();
  const result=await db.execute(purgePostsQuery(ids,workspace));
  const targets=result.rows.map(row=>String(row.id));
  if (!targets.length) return 0;
  await logAudit("post.purged", "post", null, { ids: targets });
  return targets.length;
}

/** Permanently removes drafts that have been in the trash longer than 30 days. */
export async function purgeExpiredTrash() {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86400000);
  const rows = await getDb().select({ id: posts.id }).from(posts).where(and(purgeable(), lt(posts.deletedAt, cutoff))).limit(200);
  return rows.length ? purgePosts(rows.map((r) => r.id)) : 0;
}
