import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { campaignSchema } from "@/services/catalog";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  const parsed = campaignSchema.safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
  const [row] = await getDb().update(campaigns).set({ ...parsed.data, updatedAt: new Date() }).where(eq(campaigns.id, id)).returning();
  if (!row) return NextResponse.json({ error: "الحملة غير موجودة" }, { status: 404 });
  await logAudit("campaign.updated", "campaign", id);
  return NextResponse.json(row);
}
