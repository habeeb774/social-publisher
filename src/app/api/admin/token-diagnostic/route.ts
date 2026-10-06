import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { facebookPages, posts } from "@/db/schema";
import { and, desc, eq, gte, ilike } from "drizzle-orm";
import { decryptToken } from "@/services/page-tokens";
import { inspectGraphToken } from "@/services/facebook-graph";

export const dynamic = "force-dynamic";


export async function GET(_request: NextRequest) {
  const rows = await getDb().select({
    id: facebookPages.id,
    name: facebookPages.name,
    facebookPageId: facebookPages.facebookPageId,
    platform: facebookPages.platform,
    accessTokenEnc: facebookPages.accessTokenEnc,
    status: facebookPages.status,
    isActive: facebookPages.isActive,
    updatedAt: facebookPages.updatedAt,
    lastConnectionCheck: facebookPages.lastConnectionCheck,
  }).from(facebookPages).where(eq(facebookPages.platform, "facebook"));

  const pages = [];
  for (const row of rows) {
    let decryptOk = false;
    let storedValidity: unknown = null;
        if (row.accessTokenEnc) {
      try {
        const token = decryptToken(row.accessTokenEnc);
        decryptOk = true;
                storedValidity = await inspectGraphToken(token);
      } catch (error) {
        storedValidity = { valid: false, reason: error instanceof Error ? error.message : String(error) };
      }
    }
    pages.push({
      id: row.id,
      name: row.name,
      facebookPageId: row.facebookPageId,
      status: row.status,
      isActive: row.isActive,
      hasStoredToken: Boolean(row.accessTokenEnc),
      decryptOk,
      storedValidity,
      updatedAt: row.updatedAt,
      lastConnectionCheck: row.lastConnectionCheck,
    });
  }

  let globalValidity: unknown = null;
    const global = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  if (global) {
        globalValidity = await inspectGraphToken(global);
  }

  const laqta = rows.find((row) => row.name.includes("لقطة"));
  const recent190 = laqta ? await getDb().select({
    id: posts.id,
    status: posts.status,
    scheduledAt: posts.scheduledAt,
    failedAt: posts.failedAt,
    lastError: posts.lastError,
    content: posts.content,
  }).from(posts).where(and(
    eq(posts.pageId, laqta.id),
    eq(posts.status, "failed"),
    gte(posts.failedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
    ilike(posts.lastError, "%#190%")
  )).orderBy(desc(posts.failedAt)).limit(20) : [];

  return NextResponse.json({
    pages,
    global: { configured: Boolean(global), validity: globalValidity },
    recent190: recent190.map((row) => ({
      id: row.id,
      scheduledAt: row.scheduledAt,
      failedAt: row.failedAt,
      error: row.lastError?.slice(0, 220),
      content: row.content.slice(0, 100),
    })),
  });
}
