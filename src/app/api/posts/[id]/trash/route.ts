import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guard, isUuid } from "@/services/api-guard";
import { purgePosts, restoreFromTrash } from "@/services/trash";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  const parsed = z.object({ action: z.enum(["restore", "purge"]) }).safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  try {
    if (parsed.data.action === "restore") return NextResponse.json(await restoreFromTrash(id));
    const purged = await purgePosts([id]);
    if (!purged) return NextResponse.json({ error: "لا يمكن الحذف النهائي: المنشور ليس مسودة محذوفة أو له سجل نشر" }, { status: 409 });
    return NextResponse.json({ purged });
  } catch (error) { return errorResponse(error); }
}
