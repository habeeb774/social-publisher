import { NextRequest, NextResponse } from "next/server";
import { errorResponse, guard, isUuid } from "@/services/api-guard";
import { duplicatePost } from "@/services/post-ops";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "المنشور غير موجود" }, { status: 404 });
  try { return NextResponse.json(await duplicatePost(id), { status: 201 }); } catch (error) { return errorResponse(error); }
}
