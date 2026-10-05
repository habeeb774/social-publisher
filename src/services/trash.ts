import { and, eq, inArray, isNotNull, lt, notExists } from "drizzle-orm";
import { getDb } from "@/db";
import { postMedia, postNotes, posts, postVersions, publicationAttempts } from "@/db/schema";
import { logAudit } from "./audit";

export const TRASH_DAYS = 30;

/** Only trashed drafts that never had a publication attempt can be purged, so audit history is never lost. */
const purgeable = () => and(isNotNull(posts.deletedAt), eq(posts.status, "draft"), notExists(getDb().select({ id: publicationAttempts.id }).from(publicationAttempts).where(eq(publicationAttempts.postId, posts.id))));

export async function restoreFromTrash(id: string) {
  const [row] = await getDb().update(posts).set({ deletedAt: null, updatedAt: new Date() }).where(and(eq(posts.id, id), isNotNull(posts.deletedAt))).returning();
  if (!row) throw new Error("NOT_FOUND");
  await logAudit("post.restored_from_trash", "post", id);
  return row;
}

export async function purgePosts(ids: string[]) {
  const db = getDb();
  const rows = await db.select({ id: posts.id }).from(posts).where(and(inArray(posts.id, ids), purgeable()));
  const targets = rows.map((r) => r.id);
  if (!targets.length) return 0;
  await db.delete(postMedia).where(inArray(postMedia.postId, targets));
  await db.delete(postVersions).where(inArray(postVersions.postId, targets));
  await db.delete(postNotes).where(inArray(postNotes.postId, targets));
  await db.delete(posts).where(inArray(posts.id, targets));
  await logAudit("post.purged", "post", null, { ids: targets });
  return targets.length;
}

/** Permanently removes drafts that have been in the trash longer than 30 days. */
export async function purgeExpiredTrash() {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86400000);
  const rows = await getDb().select({ id: posts.id }).from(posts).where(and(purgeable(), lt(posts.deletedAt, cutoff))).limit(200);
  return rows.length ? purgePosts(rows.map((r) => r.id)) : 0;
}
