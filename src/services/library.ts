import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { facebookPages, libraryItems, postMedia, posts } from "@/db/schema";
import { logAudit } from "./audit";
import { normalizeTags } from "./catalog";

export const LIBRARY_KINDS = { text: "نص", image: "صورة", idea: "فكرة", post: "منشور جاهز", template: "مسودة قالب" } as const;
export const IDEA_STATUSES = { new: "جديدة", planned: "مخطط لها", converted: "تحولت لمنشور", dismissed: "مستبعدة" } as const;
export type LibraryKind = keyof typeof LIBRARY_KINDS;

export const libraryItemSchema = z.object({
  kind: z.enum(Object.keys(LIBRARY_KINDS) as [LibraryKind]),
  title: z.string().trim().min(1, "العنوان مطلوب").max(160),
  body: z.string().max(63206).default(""),
  mediaUrl: z.url().refine((u) => /^https:\/\//i.test(u), "الرابط يجب أن يبدأ بـ https://").nullable().optional(),
  status: z.enum(Object.keys(IDEA_STATUSES) as [keyof typeof IDEA_STATUSES]).default("new"),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

/** Turns a library item or idea into a new draft (never schedules or publishes). Ideas are marked converted. */
export async function convertToDraft(id: string) {
  const db = getDb();
  const [item] = await db.select().from(libraryItems).where(eq(libraryItems.id, id)).limit(1);
  if (!item) throw new Error("NOT_FOUND");
  const [page] = await db.select({ id: facebookPages.id }).from(facebookPages).where(eq(facebookPages.isActive, true)).limit(1);
  if (!page) throw new Error("PAGE_UNAVAILABLE");
  const content = item.kind === "idea" ? [item.title, item.body].filter(Boolean).join("\n\n") : item.body || item.title;
  const [post] = await db.insert(posts).values({ pageId: page.id, content, status: "draft", tags: normalizeTags(item.tags) }).returning();
  if (item.mediaUrl) await db.insert(postMedia).values({ postId: post.id, type: "image", url: item.mediaUrl });
  if (item.kind === "idea") await db.update(libraryItems).set({ status: "converted", convertedPostId: post.id, updatedAt: new Date() }).where(and(eq(libraryItems.id, id)));
  await logAudit("library.converted", "library", id, { postId: post.id });
  return post;
}
