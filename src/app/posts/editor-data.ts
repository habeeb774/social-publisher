import { desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, facebookPages, mediaAssets, posts } from "@/db/schema";
import { approvalRequired } from "@/services/post-ops";
import { isPublishingEnabled } from "@/services/publishing-mode";
import { getAiProvider } from "@/services/ai-assistant";

/** Shared server data for the composer (new + edit). Each list is capped. */
export async function editorData() {
  const db = getDb();
  const [pages, campaignList, media, hashtags, approval] = await Promise.all([
    db.select({ id: facebookPages.id, name: facebookPages.name }).from(facebookPages).where(eq(facebookPages.isActive, true)),
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(sql`${campaigns.status} in ('draft','active')`).orderBy(desc(campaigns.createdAt)).limit(50),
    db.select({ id: mediaAssets.id, name: mediaAssets.name, url: mediaAssets.url }).from(mediaAssets).where(isNull(mediaAssets.deletedAt)).orderBy(desc(mediaAssets.createdAt)).limit(40),
    // Previously used internal tags, most used first. Nothing is generated automatically.
    db.execute(sql`select tag, count(*)::int as uses from ${posts}, unnest(${posts.tags}) as tag where ${posts.deletedAt} is null group by tag order by uses desc, max(${posts.createdAt}) desc limit 15`),
    approvalRequired(),
  ]);
  return { pages, campaigns: campaignList, media, hashtags: hashtags.rows as Array<{ tag: string; uses: number }>, approvalRequired: approval, publishingEnabled: isPublishingEnabled(), aiEnabled: Boolean(getAiProvider()) };
}
