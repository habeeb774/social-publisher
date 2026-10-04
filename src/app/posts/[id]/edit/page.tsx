import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { facebookPages, posts } from "@/db/schema";
import { isPublishingEnabled } from "@/services/publishing-mode";
import PostEditor from "../../post-editor";
export const dynamic="force-dynamic";

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if(!z.uuid().safeParse(id).success)notFound();
  const [row]=await getDb().select({post:posts,page:facebookPages}).from(posts).innerJoin(facebookPages,eq(posts.pageId,facebookPages.id)).where(and(eq(posts.id,id),isNull(posts.deletedAt))).limit(1);
  if(!row)notFound();
  return <PostEditor initial={{id:row.post.id,pageId:row.post.pageId,content:row.post.content,scheduledAt:row.post.scheduledAt?.toISOString()||null,updatedAt:row.post.updatedAt.toISOString(),status:row.post.status}} pages={[{id:row.page.id,name:row.page.name}]} publishingEnabled={isPublishingEnabled()}/>;
}
