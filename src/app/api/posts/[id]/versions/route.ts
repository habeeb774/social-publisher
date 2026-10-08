import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, postVersions } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { denyPostOutsideScope } from "@/services/access-scope";
import { workspacePostMutationAccess } from "@/services/workspace-post-auth";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "المنشور غير موجود" }, { status: 404 });
  try {
    const workspace = await workspacePostMutationAccess(request, ["posts.read"]);
    if (workspace.response) return workspace.response;
    const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped;
    const rows = await getDb().select({ version: postVersions }).from(postVersions)
      .innerJoin(posts, eq(posts.id, postVersions.postId))
      .where(and(eq(posts.id, id), isNull(posts.deletedAt), workspace.predicate))
      .orderBy(desc(postVersions.createdAt), desc(postVersions.id)).limit(50);
    return NextResponse.json(rows.map(row => row.version), { headers });
  } catch {
    console.error("Version history unavailable", { code: "VERSION_HISTORY_UNAVAILABLE" });
    return NextResponse.json({ error: "تعذر تحميل سجل التعديلات. حاول لاحقًا.", code: "VERSION_HISTORY_UNAVAILABLE" }, { status: 503, headers });
  }
}
