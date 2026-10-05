import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guard, isUuid } from "@/services/api-guard";
import { approvePost, rejectPost, submitForApproval } from "@/services/post-ops";

const body = z.object({ action: z.enum(["submit", "approve", "reject"]), reason: z.string().max(1000).optional() });
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  try {
    const { action, reason } = parsed.data;
    const row = action === "submit" ? await submitForApproval(id) : action === "approve" ? await approvePost(id) : await rejectPost(id, reason ?? "");
    return NextResponse.json(row);
  } catch (error) { return errorResponse(error); }
}
