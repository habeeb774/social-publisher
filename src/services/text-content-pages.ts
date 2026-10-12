import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, posts, settings } from "@/db/schema";

/**
 * Text-only page profiles. Disabled until the owner creates and connects each page.
 * No extra scheduler, external fetch, image rendering or AI calls.
 */
export const TEXT_PAGE_PROFILES = [
  { id: "remembrance", label: "نور وذكر", daily: 5, times: ["06:00", "09:00", "13:00", "17:00", "21:00"] },
  { id: "poetry", label: "بوح الحروف", daily: 4, times: ["08:00", "12:00", "16:00", "20:00"] },
  { id: "love", label: "همسات قلب", daily: 4, times: ["10:00", "14:00", "18:00", "22:00"] },
] as const;

type ProfileId = typeof TEXT_PAGE_PROFILES[number]["id"];
export type TextPageConfiguration = {
  enabled: boolean;
  facebookPageId: string;
  /** Approved, nonempty plain-text entries. Religious entries must be verified before approval. */
  approvedTexts: string[];
};

export async function enqueueTextPagePosts(now = new Date()) {
  const db = getDb();
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => local.find(x => x.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const minute = `${part("hour")}:${part("minute")}`;
  let created = 0;
  for (const profile of TEXT_PAGE_PROFILES) {
    // Only run at or after a slot in its first 10-minute window.
    const slot = profile.times.find(t => {
      const diff = Number(minute.slice(0, 2)) * 60 + Number(minute.slice(3)) - Number(t.slice(0, 2)) * 60 - Number(t.slice(3));
      return diff >= 0 && diff < 10;
    });
    if (!slot) continue;
    const [configRow] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, `text_page_config:${profile.id}`)).limit(1);
    if (!configRow) continue;
    let config: TextPageConfiguration;
    try { config = JSON.parse(configRow.value) as TextPageConfiguration; } catch { continue; }
    if (!config.enabled || !config.facebookPageId || !Array.isArray(config.approvedTexts) || !config.approvedTexts.length) continue;
    const texts = config.approvedTexts.filter(t => typeof t === "string" && t.trim().length > 0 && t.length <= 5000);
    if (!texts.length) continue;
    const [page] = await db.select({ id: facebookPages.id }).from(facebookPages).where(and(eq(facebookPages.facebookPageId, config.facebookPageId), eq(facebookPages.platform, "facebook"), eq(facebookPages.isActive, true))).limit(1);
    if (!page) continue;
    const claimKey = `text_page_slot:${profile.id}:${date}:${slot}`;
    const [claimed] = await db.insert(settings).values({ key: claimKey, value: now.toISOString() }).onConflictDoNothing().returning({ key: settings.key });
    if (!claimed) continue;
    // Deterministic rotation without replacement until the approved list wraps.
    const epochDay = Math.floor(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))) / 86400000);
    const slotIndex = (profile.times as readonly string[]).indexOf(slot);
    const content = texts[(epochDay * profile.daily + slotIndex) % texts.length];
    await db.insert(posts).values({ pageId: page.id, content, scheduledAt: now, timezone: "Asia/Riyadh", status: "scheduled", category: profile.label, tags: ["نصوص", profile.id as ProfileId] });
    created++;
  }
  return { created };
}

/** Maintain a rolling 30-day horizon for approved morning/evening remembrance. */
export async function ensureDailyRemembrance(now = new Date()) {
  const db = getDb();
  const page = await db.select({ id: facebookPages.id }).from(facebookPages)
    .where(and(eq(facebookPages.facebookPageId, "1384766158050164"), eq(facebookPages.platform, "facebook"), eq(facebookPages.isActive, true))).limit(1);
  if (!page.length) return { created: 0 };
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const morning = "أصبحنا وأصبح الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له، له الملك وله الحمد، وهو على كل شيء قدير.\\n\\nمن أذكار الصباح الواردة في صحيح مسلم، وهو مقتطف من الذكر الأطول.";
  const evening = "أمسينا وأمسى الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له، له الملك وله الحمد، وهو على كل شيء قدير.\\n\\nمن أذكار المساء الواردة في صحيح مسلم، وهو مقتطف من الذكر الأطول.";
  let created = 0;
  for (let offset = 0; offset < 30; offset++) {
    const day = new Date(Date.parse(localDay + "T00:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
    for (const [slot, content] of [["09:00", morning], ["17:00", evening]]) {
      const scheduledAt = new Date(day + "T" + slot + ":00+03:00");
      if (scheduledAt <= now) continue;
      const existing = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.pageId, page[0].id), gte(posts.scheduledAt, scheduledAt), lt(posts.scheduledAt, new Date(scheduledAt.getTime() + 60000)))).limit(1);
      if (existing.length) continue;
      await db.insert(posts).values({ pageId: page[0].id, content, scheduledAt, timezone: "Asia/Riyadh", status: "scheduled", category: "آية وسكن", tags: ["آية وسكن", "أذكار يومية"] });
      created++;
    }
  }
  return { created };
}
