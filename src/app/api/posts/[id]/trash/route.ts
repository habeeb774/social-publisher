import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guard, isUuid } from "@/services/api-guard";
import { purgePosts, restoreFromTrash } from "@/services/trash";
import { denyPostOutsideScope } from "@/services/access-scope";
import { workspacePostMutationAccess } from "@/services/workspace-post-auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const workspace=await workspacePostMutationAccess(request,["posts.delete"]);
  if(workspace.response)return workspace.response;
  const { id } = await params;
  const parsed = z.object({ action: z.enum(["restore", "purge"]) }).safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  try {
    if (parsed.data.action === "restore") return NextResponse.json(await restoreFromTrash(id,workspace.context));
    const purged = await purgePosts([id],workspace.context);
    if (!purged) return NextResponse.json({ error: "لا يمكن الحذف النهائي: المنشور ليس مسودة محذوفة أو له سجل نشر" }, { status: 409 });
    return NextResponse.json({ purged });
  } catch (error) {
    if(error instanceof Error && error.message==="NOT_FOUND")return errorResponse(error);
    console.error("Trash operation unavailable",{code:"TRASH_OPERATION_UNAVAILABLE"});
    return NextResponse.json({error:"تعذر تنفيذ الإجراء. حدّث القائمة للتحقق من حالة المنشور."},{status:503});
  }
}
