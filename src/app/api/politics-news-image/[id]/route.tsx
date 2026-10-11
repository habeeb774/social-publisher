import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { extractPoliticsCard } from "@/services/politics-editorial";
import { renderTechNewsCard } from "@/services/tech-news-card";

export const runtime = "nodejs";
// A generated headline card, never the outlet's photo: avoids copyright claims and graphic imagery.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const [post] = await getDb().select({ content: posts.content }).from(posts).where(eq(posts.id, id)).limit(1);
  if (!post) return new Response("Not found", { status: 404 });
  const { title, source } = extractPoliticsCard(post.content);
  return renderTechNewsCard(title, source, { kicker: "NEWS", label: "أخبار سياسية", page: "رَصْدُوق", accent: "#fbbf24", bar: "#f59e0b", background: "linear-gradient(145deg,#1a1206,#3b2a0e)", line: "#5b4520" });
}
