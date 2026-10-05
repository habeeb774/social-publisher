import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { libraryItems } from "@/db/schema";
import { errorResponse, guard, isUuid } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { normalizeTags } from "@/services/catalog";
import { convertToDraft, libraryItemSchema } from "@/services/library";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  const parsed = libraryItemSchema.partial().safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const { tags, ...rest } = parsed.data;
  const [row] = await getDb().update(libraryItems).set({ ...rest, ...(tags ? { tags: normalizeTags(tags) } : {}), updatedAt: new Date() }).where(eq(libraryItems.id, id)).returning();
  if (!row) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  await logAudit("library.updated", "library", id);
  return NextResponse.json(row);
}
/** POST {action:"convert"} creates a draft from the item. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  const parsed = z.object({ action: z.literal("convert") }).safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  try { return NextResponse.json(await convertToDraft(id), { status: 201 }); } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  await getDb().delete(libraryItems).where(eq(libraryItems.id, id));
  await logAudit("library.deleted", "library", id);
  return NextResponse.json({ ok: true });
}
