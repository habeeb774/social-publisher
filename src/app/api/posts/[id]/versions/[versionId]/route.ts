import { NextRequest, NextResponse } from "next/server";
import { errorResponse, guard, isUuid } from "@/services/api-guard";
import { restoreVersion } from "@/services/post-ops";
import { denyPostOutsideScope } from "@/services/access-scope";
import { workspacePostMutationAccess } from "@/services/workspace-post-auth";

/** Restores an internal version. Never touches the published Facebook post. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const workspace = await workspacePostMutationAccess(request,["posts.edit"]);
  if (workspace.response) return workspace.response;
  const { id, versionId } = await params;
  if (!isUuid(id) || !isUuid(versionId)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  try { return NextResponse.json(await restoreVersion(id, versionId, workspace.context)); }
  catch (error) {
    if (error instanceof Error && ["NOT_FOUND","NOT_EDITABLE"].includes(error.message)) return errorResponse(error);
    console.error("Version restoration unavailable",{code:"VERSION_RESTORE_UNAVAILABLE"});
    return NextResponse.json({error:"تعذر استرجاع النسخة. حدّث تفاصيل المنشور للتحقق قبل إعادة المحاولة.",code:"VERSION_RESTORE_UNAVAILABLE"},{status:503});
  }
}
