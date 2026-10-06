import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, posts } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { getPostPerformance } from "@/services/post-insights";
import { denyPostOutsideScope } from "@/services/access-scope";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  const [row] = await getDb().select({ fbId: posts.facebookPostId, status: posts.status, pageFbId: facebookPages.facebookPageId }).from(posts).innerJoin(facebookPages, eq(posts.pageId, facebookPages.id)).where(eq(posts.id, id)).limit(1);
  if (!row || row.status !== "published" || !row.fbId) return NextResponse.json({ available: false, reason: "المنشور لم يُنشر بعد", metrics: [] });
  return NextResponse.json(await getPostPerformance(row.fbId, row.pageFbId));
}
