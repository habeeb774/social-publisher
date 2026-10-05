import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mediaAssets, postMedia } from "@/db/schema";
import { normalizeTags } from "./catalog";
import { approvalRequired } from "./post-ops";
import { getPublishingRules } from "./rules-store";
import { nextAllowed, violation } from "./publishing-rules";
import type { postInputSchema } from "./posts";
import type { z } from "zod";

type Input = z.infer<typeof postInputSchema>;

/** Maps validated editor input to DB fields. Scheduling goes to approval when the workflow is enabled. */
export async function toPostFields(data: Input) {
  const status = data.status === "scheduled" && await approvalRequired() ? "pending_approval" as const : data.status;
  // "shift" mode moves a scheduled time out of quiet days / the blocked window; "warn" leaves it.
  let scheduledAt = data.scheduledAt ?? null;
  if (data.status === "scheduled" && scheduledAt) { const rules = await getPublishingRules(); if (rules.window.mode === "shift" && violation(scheduledAt, rules)) scheduledAt = nextAllowed(scheduledAt, rules) ?? scheduledAt; }
  return {
    content: data.content,
    status,
    scheduledAt,
    timezone: data.timezone,
    ...(data.category !== undefined ? { category: data.category } : {}),
    ...(data.tags !== undefined ? { tags: normalizeTags(data.tags) } : {}),
    ...(data.campaignId !== undefined ? { campaignId: data.campaignId } : {}),
  };
}

/** Replaces the single image attachment when the editor sent one (undefined = leave unchanged). */
export async function syncImage(postId: string, imageUrl: string | null | undefined) {
  if (imageUrl === undefined) return;
  const db = getDb();
  await db.delete(postMedia).where(eq(postMedia.postId, postId));
  if (!imageUrl) return;
  await db.insert(postMedia).values({ postId, type: "image", url: imageUrl });
  // Every image used in a post is registered in the media library for reuse.
  await db.insert(mediaAssets).values({ name: imageUrl.split("/").pop()!.split("?")[0].slice(0, 160) || "image", url: imageUrl, source: "post" }).onConflictDoNothing();
}
