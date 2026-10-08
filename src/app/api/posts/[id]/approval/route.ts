import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guard, isUuid } from "@/services/api-guard";
import { approvePost, rejectPost, submitForApproval } from "@/services/post-ops";
import { approvalActionPermission } from "@/services/approval-permissions";
import { denyPostOutsideScope } from "@/services/access-scope";
import { workspacePostMutationAccess } from "@/services/workspace-post-auth";

const body = z.object({ action: z.enum(["submit", "approve", "reject", "changes"]), reason: z.string().max(1000).optional() });
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request, true, "content.read"); if (denied) return denied;
  const { id } = await params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  const actionDenied = await guard(request, true, approvalActionPermission(parsed.data.action));
  if (actionDenied) return actionDenied;
  const workspace = await workspacePostMutationAccess(request, parsed.data.action === "submit" ? ["posts.edit"] : parsed.data.action === "approve" ? ["posts.approve", "posts.publish"] : ["posts.approve"]);
  if (workspace.response) return workspace.response;
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  try {
    const { action, reason } = parsed.data;
    const row = action === "submit" ? await submitForApproval(id, workspace.context) : action === "approve" ? await approvePost(id, workspace.context) : await rejectPost(id, reason ?? "", action === "changes" ? "changes" : "rejected", workspace.context);
    return NextResponse.json(row);
  } catch (error) { return errorResponse(error); }
}
