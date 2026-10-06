import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, facebookPages, mediaAssets, posts, postTemplates } from "@/db/schema";
import { storageProvider } from "@/services/storage";
import { approvalRequired } from "@/services/post-ops";
import { isPublishingEnabled } from "@/services/publishing-mode";
import { getAiProvider } from "@/services/ai-assistant";
import { listMetaAccounts } from "@/services/meta-accounts";

/** Shared server data for the composer (new + edit). Each list is capped. */
export async function editorData(allowed: Set<string> | null = null) {
  const db = getDb();
  const [rawPages, campaignList, media, hashtags, approval, templates, metaAccounts] = await Promise.all([
    db.select({ id: facebookPages.id, name: facebookPages.name, facebookPageId: facebookPages.facebookPageId, platform: facebookPages.platform }).from(facebookPages).where(and(eq(facebookPages.isActive, true), allowed === null ? undefined : allowed.size ? inArray(facebookPages.id, Array.from(allowed)) : sql`false`)),
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(sql`${campaigns.status} in ('draft','active')`).orderBy(desc(campaigns.createdAt)).limit(50),
    db.select({ id: mediaAssets.id, name: mediaAssets.name, url: mediaAssets.url }).from(mediaAssets).where(isNull(mediaAssets.deletedAt)).orderBy(desc(mediaAssets.createdAt)).limit(40),
    // Previously used internal tags, most used first. Nothing is generated automatically.
    db.execute(sql`select tag, count(*)::int as uses from ${posts}, unnest(${posts.tags}) as tag where ${posts.deletedAt} is null group by tag order by uses desc, max(${posts.createdAt}) desc limit 15`),
    approvalRequired(),
    db.select({ id: postTemplates.id, name: postTemplates.name, content: postTemplates.content }).from(postTemplates).orderBy(desc(postTemplates.updatedAt)).limit(30),
    listMetaAccounts(),
  ]);
  const pages = rawPages.map((page) => {
    const owner = metaAccounts.find((account) => page.platform === "instagram" ? account.instagramIds.includes(page.facebookPageId) : account.pageIds.includes(page.facebookPageId));
    return { id: page.id, name: page.name, platform: page.platform, accountId: owner?.id ?? null, accountName: owner?.name ?? null };
  });
  return { pages, campaigns: campaignList, media, hashtags: hashtags.rows as Array<{ tag: string; uses: number }>, approvalRequired: approval, publishingEnabled: isPublishingEnabled(), aiEnabled: Boolean(getAiProvider()), templates, uploadEnabled: storageProvider.configured() };
}
