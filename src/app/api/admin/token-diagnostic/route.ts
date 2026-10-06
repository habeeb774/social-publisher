import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptToken } from "@/services/page-tokens";
import { inspectGraphToken } from "@/services/facebook-graph";

export const dynamic = "force-dynamic";

const fp = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);

export async function POST(request: NextRequest) {
  const expected = process.env.IMAGE_REPAIR_TOKEN;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
    let storedFingerprint: string | null = null;
    if (row.accessTokenEnc) {
      try {
        const token = decryptToken(row.accessTokenEnc);
        decryptOk = true;
        storedFingerprint = fp(token);
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
      storedFingerprint,
      storedValidity,
      updatedAt: row.updatedAt,
      lastConnectionCheck: row.lastConnectionCheck,
    });
  }

  let globalValidity: unknown = null;
  let globalFingerprint: string | null = null;
  const global = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  if (global) {
    globalFingerprint = fp(global);
    globalValidity = await inspectGraphToken(global);
  }

  return NextResponse.json({
    pages,
    global: { configured: Boolean(global), fingerprint: globalFingerprint, validity: globalValidity },
  });
}
