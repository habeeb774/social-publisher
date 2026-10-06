import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, posts } from "@/db/schema";
import { getSetting, setSetting } from "./settings-store";
import { storedPageToken } from "./page-tokens";

export type Slot = { hour: number; weekday: number | null; score: number; posts: number };
export type BestTimes = { ready: boolean; sample: number; hours: Slot[]; days: Slot[]; computedAt: string; reason?: string };
const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const dayName = (d: number) => DAYS[d] ?? "";
const CACHE_HOURS = 6;
const MIN_POSTS = 8;

/** Engagement (reactions + comments + shares) per published post, grouped by Riyadh hour and weekday. */
export async function computeBestTimes(): Promise<BestTimes> {
  const db = getDb();
  const rows = await db.select({ fbId: posts.facebookPostId, at: posts.publishedAt, page: facebookPages.facebookPageId }).from(posts)
    .innerJoin(facebookPages, eq(facebookPages.id, posts.pageId))
    .where(and(eq(posts.status, "published"), isNotNull(posts.facebookPostId), isNull(posts.deletedAt), eq(facebookPages.platform, "facebook"), gte(posts.publishedAt, new Date(Date.now() - 90 * 86400000))))
    .orderBy(desc(posts.publishedAt)).limit(120);
  const version = process.env.META_GRAPH_VERSION || "v23.0";
  const tokens = new Map<string, string>();
  const scored: Array<{ hour: number; weekday: number; engagement: number }> = [];
  for (const r of rows) {
    if (!r.fbId || !r.at) continue;
    let token = tokens.get(r.page);
    if (!token) { token = (await storedPageToken(r.page)) ?? process.env.META_PAGE_ACCESS_TOKEN?.trim() ?? ""; tokens.set(r.page, token); }
    if (!token) break;
    const body = await fetch(`https://graph.facebook.com/${version}/${r.fbId}?fields=reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) }).then((x) => x.json()).catch(() => null) as { reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number }; error?: unknown } | null;
    if (!body || body.error) continue;
    const engagement = (body.reactions?.summary?.total_count ?? 0) + 2 * (body.comments?.summary?.total_count ?? 0) + 3 * (body.shares?.count ?? 0);
    const local = new Date(r.at.getTime() + 3 * 3600000);
    scored.push({ hour: local.getUTCHours(), weekday: local.getUTCDay(), engagement });
  }
  const group = (key: (s: typeof scored[number]) => number) => {
    const m = new Map<number, { total: number; n: number }>();
    for (const s of scored) { const k = key(s); const g = m.get(k) ?? { total: 0, n: 0 }; g.total += s.engagement; g.n++; m.set(k, g); }
    return [...m.entries()].map(([k, g]) => ({ k, score: Math.round((g.total / g.n) * 10) / 10, n: g.n }));
  };
  const hours = group((s) => s.hour).filter((g) => g.n >= 2).sort((a, b) => b.score - a.score).slice(0, 3).map((g) => ({ hour: g.k, weekday: null, score: g.score, posts: g.n }));
  const days = group((s) => s.weekday).filter((g) => g.n >= 2).sort((a, b) => b.score - a.score).slice(0, 3).map((g) => ({ hour: -1, weekday: g.k, score: g.score, posts: g.n }));
  const ready = scored.length >= MIN_POSTS && hours.length > 0;
  return { ready, sample: scored.length, hours, days, computedAt: new Date().toISOString(), reason: ready ? undefined : `نحتاج ${MIN_POSTS} منشورات منشورة على الأقل لاقتراح دقيق (المتاح ${scored.length}).` };
}

/** Cached for a few hours; recomputing calls Graph once per recent post. */
export async function bestTimes(force = false): Promise<BestTimes> {
  const cached = await getSetting<BestTimes | null>("best_times", null);
  if (!force && cached && Date.now() - new Date(cached.computedAt).getTime() < CACHE_HOURS * 3600000) return cached;
  const fresh = await computeBestTimes();
  await setSetting("best_times", fresh);
  return fresh;
}
