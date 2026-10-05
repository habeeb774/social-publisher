import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guard, isUuid } from "@/services/api-guard";
import { approvePost, rejectPost, submitForApproval } from "@/services/post-ops";
import { sessionFrom } from "@/services/request-auth";
import { can } from "@/services/rbac";

const body = z.object({ action: z.enum(["submit", "approve", "reject", "changes"]), reason: z.string().max(1000).optional() });
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request, true, "content.read"); if (denied) return denied;
  const { id } = await params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  try {
    const { action, reason } = parsed.data;
    // Submitting is an editor action; approving/rejecting requires the review permission.
    const session = await sessionFrom(request);
    if (action !== "submit" && !can(session?.role, "content.review")) return NextResponse.json({ error: "المراجعة تتطلب صلاحية مراجع أو مدير", code: "FORBIDDEN" }, { status: 403 });
    const row = action === "submit" ? await submitForApproval(id) : action === "approve" ? await approvePost(id) : await rejectPost(id, reason ?? "", action === "changes" ? "changes" : "rejected");
    return NextResponse.json(row);
  } catch (error) { return errorResponse(error); }
}
