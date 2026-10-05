import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { postTemplates } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { templateSchema } from "@/services/catalog";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  const parsed = templateSchema.partial().safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const [row] = await getDb().update(postTemplates).set({ ...parsed.data, updatedAt: new Date() }).where(eq(postTemplates.id, id)).returning();
  if (!row) return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
  await logAudit("template.updated", "template", id);
  return NextResponse.json(row);
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  await getDb().delete(postTemplates).where(eq(postTemplates.id, id));
  await logAudit("template.deleted", "template", id);
  return NextResponse.json({ ok: true });
}
