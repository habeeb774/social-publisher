import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { postVersions } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { denyPostOutsideScope } from "@/services/access-scope";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "المنشور غير موجود" }, { status: 404 });
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  return NextResponse.json(await getDb().select().from(postVersions).where(eq(postVersions.postId, id)).orderBy(desc(postVersions.createdAt)).limit(50));
}
