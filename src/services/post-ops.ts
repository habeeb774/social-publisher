import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, postMedia, postNotes, posts, postVersions, queueSlots } from "@/db/schema";
import { getSetting } from "./settings-store";
import { currentActor, logAudit } from "./audit";
import { nextFreeSlots } from "./queue-slots";
import { sendAlert } from "./alerts";
import { prePublishChecks } from "./prepublish";

type Post = typeof posts.$inferSelect;
/** Statuses whose internal copy may still change. Published/publishing records are immutable. */
export const EDITABLE = ["draft", "scheduled", "pending_approval", "approved", "failed"] as const;

export const approvalRequired = () => getSetting("approval_required", false);

/** Saves the current state of a post before it changes, so it can be restored later. */
export async function snapshotPost(post: Post, reason: string) {
  const db = getDb();
  const media = await db.select({ url: postMedia.url, type: postMedia.type, mimeType: postMedia.mimeType }).from(postMedia).where(eq(postMedia.postId, post.id));
  await db.insert(postVersions).values({ postId: post.id, content: post.content, scheduledAt: post.scheduledAt, status: post.status, mediaSnapshot: media, changedBy: currentActor(), reason });
}

export async function duplicatePost(id: string) {
  const db = getDb();
  const [source] = await db.select().from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!source) throw new Error("NOT_FOUND");
  const [copy] = await db.insert(posts).values({ pageId: source.pageId, content: source.content, status: "draft", timezone: source.timezone, category: source.category, tags: source.tags, campaignId: source.campaignId }).returning();
  const media = await db.select().from(postMedia).where(eq(postMedia.postId, id));
  if (media.length) await db.insert(postMedia).values(media.map((item) => ({ postId: copy.id, type: item.type, url: item.url, storageKey: item.storageKey, mimeType: item.mimeType, size: item.size })));
  await logAudit("post.duplicated", "post", copy.id, { sourceId: id });
  return copy;
}

export async function restoreVersion(postId: string, versionId: string) {
  const db = getDb();
  const [version] = await db.select().from(postVersions).where(and(eq(postVersions.id, versionId), eq(postVersions.postId, postId))).limit(1);
  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), isNull(posts.deletedAt))).limit(1);
  if (!version || !post) throw new Error("NOT_FOUND");
  if (!["draft", "scheduled", "pending_approval", "approved"].includes(post.status)) throw new Error("NOT_EDITABLE");
  await snapshotPost(post, "before_restore");
  // A restored past time would publish immediately, so fall back to draft without a time.
  const future = version.scheduledAt && version.scheduledAt.getTime() > Date.now() + 60000;
  const [updated] = await db.update(posts).set({ content: version.content, scheduledAt: future ? version.scheduledAt : null, status: post.status === "scheduled" && !future ? "draft" : post.status, inQueue: false, updatedAt: new Date() })
    .where(and(eq(posts.id, postId), inArray(posts.status, ["draft", "scheduled", "pending_approval", "approved"]))).returning();
  if (!updated) throw new Error("NOT_EDITABLE");
  const snapshot = Array.isArray(version.mediaSnapshot) ? version.mediaSnapshot as Array<{ url: string; type: string; mimeType: string | null }> : [];
  await db.delete(postMedia).where(eq(postMedia.postId, postId));
  if (snapshot.length) await db.insert(postMedia).values(snapshot.map((item) => ({ postId, url: item.url, type: item.type, mimeType: item.mimeType })));
  await logAudit("post.restored", "post", postId, { versionId });
  return updated;
}

export type BulkAction = "schedule" | "to_draft" | "unschedule" | "archive" | "delete_drafts" | "change_page" | "assign_campaign";
export async function bulkAction(ids: string[], action: BulkAction, value?: string | null) {
  const db = getDb();
  const rows = await db.select().from(posts).where(and(inArray(posts.id, ids), isNull(posts.deletedAt)));
  const changed: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const now = Date.now();
  for (const post of rows) {
    const guard = (statuses: string[]) => and(eq(posts.id, post.id), inArray(posts.status, statuses as Post["status"][]));
    let result: Post[] = [];
    if (action === "schedule") {
      if (!["draft", "approved"].includes(post.status) || !post.scheduledAt || post.scheduledAt.getTime() <= now + 60000) { skipped.push({ id: post.id, reason: "يحتاج موعدًا مستقبليًا وحالة مسودة أو موافق عليه" }); continue; }
      const [image] = await db.select({ url: postMedia.url }).from(postMedia).where(eq(postMedia.postId, post.id)).limit(1);
      const check = await prePublishChecks({ pageId: post.pageId, content: post.content, scheduledAt: post.scheduledAt, imageUrl: image?.url, postId: post.id });
      if (check.blocking) { skipped.push({ id: post.id, reason: check.items.filter((i) => i.critical && !i.ok).map((i) => i.label).join("، ") }); continue; }
      if (post.status === "draft" && await approvalRequired()) result = await db.update(posts).set({ status: "pending_approval", updatedAt: new Date() }).where(guard(["draft"])).returning();
      else result = await db.update(posts).set({ status: "scheduled", updatedAt: new Date() }).where(guard(["draft", "approved"])).returning();
    } else if (action === "to_draft" || action === "unschedule") {
      result = await db.update(posts).set({ status: "draft", inQueue: false, queueOrder: null, scheduledAt: action === "unschedule" ? null : post.scheduledAt, updatedAt: new Date() }).where(guard(["scheduled", "pending_approval", "approved", "failed"])).returning();
    } else if (action === "archive") {
      result = await db.update(posts).set({ status: "archived", inQueue: false, updatedAt: new Date() }).where(guard(["draft", "scheduled", "pending_approval", "approved", "failed", "cancelled", "published"])).returning();
    } else if (action === "delete_drafts") {
      result = await db.update(posts).set({ deletedAt: new Date(), updatedAt: new Date() }).where(guard(["draft"])).returning();
    } else if (action === "change_page") {
      if (!value) throw new Error("PAGE_REQUIRED");
      const [page] = await db.select({ id: facebookPages.id }).from(facebookPages).where(and(eq(facebookPages.id, value), eq(facebookPages.isActive, true))).limit(1);
      if (!page) throw new Error("PAGE_UNAVAILABLE");
      result = await db.update(posts).set({ pageId: page.id, updatedAt: new Date() }).where(guard(["draft", "scheduled", "pending_approval", "approved", "failed"])).returning();
    } else if (action === "assign_campaign") {
      result = await db.update(posts).set({ campaignId: value || null, updatedAt: new Date() }).where(and(eq(posts.id, post.id), isNull(posts.deletedAt))).returning();
    }
    if (result.length) changed.push(post.id); else skipped.push({ id: post.id, reason: "الحالة الحالية لا تسمح بهذا الإجراء" });
  }
  for (const id of ids) if (!rows.some((row) => row.id === id)) skipped.push({ id, reason: "غير موجود" });
  if (action === "to_draft" || action === "unschedule" || action === "archive") await recomputeQueue();
  await logAudit(`post.bulk.${action}`, "post", null, { changed, skipped: skipped.length, value: value ?? null });
  return { changed, skipped };
}

export async function submitForApproval(id: string) {
  const [row] = await getDb().update(posts).set({ status: "pending_approval", updatedAt: new Date() }).where(and(eq(posts.id, id), eq(posts.status, "draft"), isNull(posts.deletedAt))).returning();
  if (!row) throw new Error("NOT_EDITABLE");
  await logAudit("post.submitted", "post", id);
  return row;
}
export async function approvePost(id: string) {
  const db = getDb();
  const [post] = await db.select().from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!post || post.status !== "pending_approval") throw new Error("NOT_PENDING");
  const future = post.scheduledAt && post.scheduledAt.getTime() > Date.now() + 60000;
  const [row] = await db.update(posts).set({ status: future ? "scheduled" : "approved", updatedAt: new Date() }).where(and(eq(posts.id, id), eq(posts.status, "pending_approval"))).returning();
  if (!row) throw new Error("NOT_PENDING");
  await logAudit("post.approved", "post", id);
  await sendAlert("approved", `تمت الموافقة على منشور (${id.slice(0, 8)})`, future ? "أصبح المنشور مجدولًا." : "الموعد مضى؛ حدّد موعدًا جديدًا لجدولته.", 0);
  return row;
}
export async function rejectPost(id: string, reason: string) {
  const db = getDb();
  const [row] = await db.update(posts).set({ status: "draft", updatedAt: new Date() }).where(and(eq(posts.id, id), eq(posts.status, "pending_approval"), isNull(posts.deletedAt))).returning();
  if (!row) throw new Error("NOT_PENDING");
  if (reason.trim()) await db.insert(postNotes).values({ postId: id, body: `رُفض: ${reason.trim()}`, author: currentActor() });
  await logAudit("post.rejected", "post", id, { reason });
  await sendAlert("rejected", `رُفض منشور (${id.slice(0, 8)})`, reason || "بدون سبب", 0);
  return row;
}

/** Appends a post to the end of the queue and assigns it the first free slot. */
export async function addToQueue(id: string) {
  const db = getDb();
  const slots = await db.select({ weekday: queueSlots.weekday, time: queueSlots.time }).from(queueSlots);
  if (!slots.length) throw new Error("NO_SLOTS");
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${posts.queueOrder}), 0)` }).from(posts).where(eq(posts.inQueue, true));
  const status = await approvalRequired() ? "pending_approval" : "scheduled";
  const [row] = await db.update(posts).set({ inQueue: true, queueOrder: Number(max) + 1, status, updatedAt: new Date() }).where(and(eq(posts.id, id), inArray(posts.status, ["draft", "approved", "scheduled"]), isNull(posts.deletedAt))).returning();
  if (!row) throw new Error("NOT_EDITABLE");
  await recomputeQueue();
  await logAudit("post.queued", "post", id);
  const [fresh] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return fresh ?? row;
}

/** Reassigns queued posts, in queue order, to the next free slots. Only unclaimed rows are touched. */
export async function recomputeQueue(order?: string[]) {
  const db = getDb();
  const slots = await db.select({ weekday: queueSlots.weekday, time: queueSlots.time }).from(queueSlots);
  let queued = await db.select().from(posts).where(and(eq(posts.inQueue, true), inArray(posts.status, ["scheduled", "pending_approval"]), isNull(posts.deletedAt))).orderBy(asc(posts.queueOrder), asc(posts.createdAt));
  if (order) {
    const index = new Map(order.map((id, i) => [id, i]));
    queued = [...queued].sort((a, b) => (index.get(a.id) ?? 1e9) - (index.get(b.id) ?? 1e9));
  }
  if (!slots.length) return [];
  const fixed = await db.select({ at: posts.scheduledAt }).from(posts).where(and(eq(posts.inQueue, false), eq(posts.status, "scheduled"), isNull(posts.deletedAt)));
  const times = nextFreeSlots(slots, new Date(), queued.length, fixed.map((row) => row.at!.getTime()));
  const assigned: Array<{ id: string; scheduledAt: Date }> = [];
  for (const [i, post] of queued.entries()) {
    if (!times[i]) break;
    await db.update(posts).set({ queueOrder: i + 1, scheduledAt: times[i], updatedAt: new Date() }).where(and(eq(posts.id, post.id), inArray(posts.status, ["scheduled", "pending_approval"])));
    assigned.push({ id: post.id, scheduledAt: times[i] });
  }
  return assigned;
}
