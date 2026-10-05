import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { facebookPages, postMedia, posts } from "@/db/schema";
import PostEditor from "../../post-editor";
import { editorData } from "../../editor-data";
export const dynamic = "force-dynamic";

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const [[row], media, data] = await Promise.all([
    db.select({ post: posts, page: facebookPages }).from(posts).innerJoin(facebookPages, eq(posts.pageId, facebookPages.id)).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1),
    db.select({ url: postMedia.url }).from(postMedia).where(eq(postMedia.postId, id)).limit(1),
    editorData(),
  ]);
  if (!row) notFound();
  const pages = data.pages.some((p) => p.id === row.page.id) ? data.pages : [{ id: row.page.id, name: row.page.name }, ...data.pages];
  const p = row.post;
  return <PostEditor {...data} pages={pages} initial={{ id: p.id, pageId: p.pageId, content: p.content, scheduledAt: p.scheduledAt?.toISOString() || null, updatedAt: p.updatedAt.toISOString(), status: p.status, category: p.category, tags: p.tags, campaignId: p.campaignId, imageUrl: media[0]?.url ?? null }} />;
}
