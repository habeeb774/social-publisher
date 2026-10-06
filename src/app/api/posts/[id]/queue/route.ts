import { NextRequest, NextResponse } from "next/server";
import { errorResponse, guard, isUuid } from "@/services/api-guard";
import { addToQueue } from "@/services/post-ops";
import { denyPostOutsideScope } from "@/services/access-scope";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "المنشور غير موجود" }, { status: 404 });
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  try { return NextResponse.json(await addToQueue(id)); } catch (error) { return errorResponse(error); }
}
