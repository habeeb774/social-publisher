import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contentGoals, posts } from "@/db/schema";

/** Goals for a month with progress = published posts (and scheduled, shown separately) in that Riyadh month. */
export async function goalsWithProgress(month: string) {
  const db = getDb();
  const from = new Date(`${month}-01T00:00:00+03:00`);
  const [y, m] = month.split("-").map(Number);
  const to = new Date(`${new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)}-01T00:00:00+03:00`);
  const [goals, counts] = await Promise.all([
    db.select().from(contentGoals).where(eq(contentGoals.month, month)),
    db.select({ category: posts.category, published: sql<number>`count(*) filter (where ${posts.status}='published' and ${posts.publishedAt} >= ${from.toISOString()}::timestamptz and ${posts.publishedAt} < ${to.toISOString()}::timestamptz)::int`, scheduled: sql<number>`count(*) filter (where ${posts.status} in ('scheduled','pending_approval') and ${posts.scheduledAt} >= ${from.toISOString()}::timestamptz and ${posts.scheduledAt} < ${to.toISOString()}::timestamptz)::int` }).from(posts).where(and(isNull(posts.deletedAt))).groupBy(posts.category),
  ]);
  const sum = (key: "published" | "scheduled", category: string | null) => counts.filter((c) => category === null || c.category === category).reduce((s, c) => s + c[key], 0);
  return goals.sort((a, b) => (a.category ? 1 : 0) - (b.category ? 1 : 0)).map((g) => {
    const published = sum("published", g.category), scheduled = sum("scheduled", g.category);
    return { ...g, published, scheduled, percent: Math.min(100, Math.round((published / g.target) * 100)) };
  });
}
export const currentMonth = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 7);
