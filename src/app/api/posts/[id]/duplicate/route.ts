import { NextRequest, NextResponse } from "next/server";
import { errorResponse, guard, isUuid } from "@/services/api-guard";
import { duplicatePost } from "@/services/post-ops";
import { denyPostOutsideScope } from "@/services/access-scope";
import { workspacePostMutationAccess } from "@/services/workspace-post-auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const workspace=await workspacePostMutationAccess(request,["posts.read","posts.create"]);
  if(workspace.response)return workspace.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "المنشور غير موجود" }, { status: 404 });
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  try { return NextResponse.json(await duplicatePost(id,workspace.context), { status: 201 }); }
  catch (error) {
    if(error instanceof Error && error.message==="WORKSPACE_CAMPAIGN_UNAVAILABLE")return NextResponse.json({error:"نسخ منشور مرتبط بحملة غير متاح حتى يكتمل ربط الحملات بمساحة العمل."},{status:422});
    if(workspace.context && !(error instanceof Error && error.message==="NOT_FOUND")) {
      console.error("Workspace duplicate unavailable",{code:"WORKSPACE_DUPLICATE_UNAVAILABLE"});
      return NextResponse.json({error:"تعذر نسخ المنشور. حدّث القائمة للتحقق قبل إعادة المحاولة."},{status:503});
    }
    return errorResponse(error);
  }
}
