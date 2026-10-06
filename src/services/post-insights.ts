import { storedPageToken } from "./page-tokens";
// Facebook post performance via the Graph API. Fields are discovered, not assumed:
// each candidate metric is requested on its own and only the ones Facebook returns are shown.
import { isGraphConfigured } from "./facebook-graph";

const base = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;
const CANDIDATE_METRICS: Record<string, string> = {
  post_impressions_unique: "الوصول",
  post_impressions: "مرات الظهور",
  post_clicks: "النقرات",
  post_reactions_by_type_total: "التفاعلات حسب النوع",
};

export type PostPerformance = { available: boolean; reason?: string; metrics: Array<{ key: string; label: string; value: number }>; fetchedAt: string };

async function getJson(url: string) {
  // Cached for 30 minutes so dashboards don't hammer the Graph API.
  const response = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(10000) });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok && !body.error, body };
}

async function pageToken(pageId: string) {
  // A token saved for this page (added from the accounts screen) wins over the global one.
  const stored = await storedPageToken(pageId);
  if (stored) return stored;
  const token = process.env.META_PAGE_ACCESS_TOKEN!.trim();
  const lookup = await getJson(`${base()}/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`);
  return lookup.ok && typeof lookup.body.access_token === "string" ? lookup.body.access_token as string : token;
}

export async function getPostPerformance(facebookPostId: string, facebookPageId: string): Promise<PostPerformance> {
  const fetchedAt = new Date().toISOString();
  if (!isGraphConfigured()) return { available: false, reason: "توكن Facebook غير مُعد", metrics: [], fetchedAt };
  try {
    const token = encodeURIComponent(await pageToken(facebookPageId));
    const metrics: PostPerformance["metrics"] = [];
    const counts = await getJson(`${base()}/${facebookPostId}?fields=shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)&access_token=${token}`);
    if (counts.ok) {
      const b = counts.body as { shares?: { count?: number }; reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } };
      if (b.reactions?.summary?.total_count !== undefined) metrics.push({ key: "reactions", label: "التفاعلات", value: b.reactions.summary.total_count });
      if (b.comments?.summary?.total_count !== undefined) metrics.push({ key: "comments", label: "التعليقات", value: b.comments.summary.total_count });
      metrics.push({ key: "shares", label: "المشاركات", value: b.shares?.count ?? 0 });
    }
    await Promise.all(Object.entries(CANDIDATE_METRICS).map(async ([metric, label]) => {
      const result = await getJson(`${base()}/${facebookPostId}/insights?metric=${metric}&access_token=${token}`);
      const value = (result.body as { data?: Array<{ values?: Array<{ value?: unknown }> }> }).data?.[0]?.values?.[0]?.value;
      if (!result.ok || value === undefined) return;
      if (typeof value === "number") metrics.push({ key: metric, label, value });
      else if (value && typeof value === "object") for (const [type, n] of Object.entries(value as Record<string, number>)) metrics.push({ key: `${metric}.${type}`, label: `${label}: ${type}`, value: Number(n) || 0 });
    }));
    if (!metrics.length) return { available: false, reason: counts.ok ? "لا توجد بيانات أداء متاحة لهذا المنشور" : (counts.body as { error?: { message?: string } }).error?.message ?? "تعذر جلب البيانات", metrics, fetchedAt };
    return { available: true, metrics, fetchedAt };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : "تعذر جلب البيانات", metrics: [], fetchedAt };
  }
}

/** Engagement score used for ranking: reactions + comments + shares (only fields actually returned). */
export const engagementOf = (perf: PostPerformance) => perf.metrics.filter((m) => ["reactions", "comments", "shares"].includes(m.key)).reduce((sum, m) => sum + m.value, 0);
