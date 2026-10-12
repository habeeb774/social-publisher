import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { logAudit } from "./audit";
import { publishGraphReel } from "./facebook-graph";
import { renderNewsReel } from "./news-reel-video";
import { extractPoliticsCard } from "./politics-editorial";
import { politicsTargetPage } from "./politics-autopost";
import { topRecentPoliticsPost } from "./politics-story";
import { isPublishingEnabled } from "./publishing-mode";
import { RASDOOQ_CARD } from "./rasdooq-card";
import { renderTechNewsCard } from "./tech-news-card";

/** One Reel per window for the top story; change this to post Reels more or less often. */
const INTERVAL_MS = 3 * 3600000;

/**
 * Turns the most important رَصْدُوق politics post of the current window into a short Reel
 * (animated vertical headline card) and publishes it with the post's caption.
 */
export async function publishPoliticsReel(now = new Date()) {
  if (!isPublishingEnabled()) return { published: false as const, reason: "PUBLISHING_DISABLED" };
  const db = getDb();
  const slotKey = `politics_reel_slot:${Math.floor(now.getTime() / INTERVAL_MS)}`;
  const [done] = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, slotKey)).limit(1);
  if (done) return { published: false as const, reason: "SLOT_DONE" };

  const page = await politicsTargetPage();
  if (!page) return { published: false as const, reason: "POLITICS_PAGE_UNAVAILABLE" };
  const chosen = await topRecentPoliticsPost(page.id, new Date(now.getTime() - INTERVAL_MS));
  if (!chosen) return { published: false as const, reason: "NO_RECENT_POST" };

  // Claim the slot before rendering and uploading so concurrent ticks cannot post two Reels.
  const claim = await db.insert(settings).values({ key: slotKey, value: JSON.stringify({ postId: chosen.id, claimedAt: now.toISOString() }) }).onConflictDoNothing().returning({ key: settings.key });
  if (!claim.length) return { published: false as const, reason: "SLOT_DONE" };
  try {
    const { title, source } = extractPoliticsCard(chosen.content);
    const card = await renderTechNewsCard(title, source, RASDOOQ_CARD, "story");
    const video = await renderNewsReel(Buffer.from(await card.arrayBuffer()));
    const reel = await publishGraphReel(page.facebookPageId, video, chosen.content);
    await logAudit("politics_reel.published", "post", chosen.id, { reelId: reel.id, pageId: page.facebookPageId });
    return { published: true as const, postId: chosen.id, reelId: reel.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The slot stays claimed: a failed or uncertain Reel is not retried until the next window.
    await logAudit("politics_reel.failed", "post", chosen.id, { error: message.slice(0, 300) });
    return { published: false as const, reason: "REEL_FAILED", error: message };
  }
}
