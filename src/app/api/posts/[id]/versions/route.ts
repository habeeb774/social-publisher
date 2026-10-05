import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { postVersions } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "المنشور غير موجود" }, { status: 404 });
  return NextResponse.json(await getDb().select().from(postVersions).where(eq(postVersions.postId, id)).orderBy(desc(postVersions.createdAt)).limit(50));
}
