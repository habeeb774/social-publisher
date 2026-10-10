import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { extractTechNewsCard } from "@/services/tech-news-card-text";
import { renderTechNewsCard } from "@/services/tech-news-card";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found",{status:404});
  const [post] = await getDb().select({content:posts.content}).from(posts).where(eq(posts.id,id)).limit(1);
  if (!post) return new Response("Not found",{status:404});
  const { title, source } = extractTechNewsCard(post.content);
  return renderTechNewsCard(title,source);
}
