import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";
import { guard } from "@/services/api-guard";
import { isGraphConfigured, linkedInstagramAccount } from "@/services/facebook-graph";
import { logAudit } from "@/services/audit";

export const dynamic = "force-dynamic";

/** Finds the Instagram professional account linked to each active Facebook page and adds it as a publishing target. */
export async function POST(request: NextRequest) {
  const denied = await guard(request, true, "settings.manage");
  if (denied) return denied;
  if (!isGraphConfigured()) return NextResponse.json({ error: "يتطلب رمز Meta (META_PAGE_ACCESS_TOKEN)" }, { status: 400 });
  const db = getDb();
  const pages = await db.select().from(facebookPages).where(and(eq(facebookPages.platform, "facebook"), eq(facebookPages.isActive, true)));
  const linked: string[] = [];
  const errors: string[] = [];
  for (const page of pages) {
    try {
      const ig = await linkedInstagramAccount(page.facebookPageId);
      if (!ig) continue;
      await db.insert(facebookPages).values({ name: `@${ig.username}`, facebookPageId: ig.id, platform: "instagram", profileUrl: `https://www.instagram.com/${ig.username}`, isActive: true, status: "active", lastConnectionCheck: new Date() })
        .onConflictDoUpdate({ target: [facebookPages.platform, facebookPages.facebookPageId], set: { name: `@${ig.username}`, isActive: true, lastConnectionCheck: new Date(), updatedAt: new Date() } });
      linked.push(`@${ig.username}`);
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  await logAudit("instagram.link_checked", "page", null, { linked, errors: errors.length });
  if (!linked.length) return NextResponse.json({ error: errors[0] ?? "لا يوجد حساب انستجرام مهني مربوط بصفحتك على فيسبوك", linked }, { status: 404 });
  return NextResponse.json({ linked });
}
