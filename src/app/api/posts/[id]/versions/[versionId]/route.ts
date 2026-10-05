import { NextRequest, NextResponse } from "next/server";
import { errorResponse, guard, isUuid } from "@/services/api-guard";
import { restoreVersion } from "@/services/post-ops";

/** Restores an internal version. Never touches the published Facebook post. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id, versionId } = await params;
  if (!isUuid(id) || !isUuid(versionId)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  try { return NextResponse.json(await restoreVersion(id, versionId)); } catch (error) { return errorResponse(error); }
}
