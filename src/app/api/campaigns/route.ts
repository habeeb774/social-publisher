import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { campaignSchema } from "@/services/catalog";

export async function GET(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  return NextResponse.json(await getDb().select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(200));
}
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = campaignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
  const [row] = await getDb().insert(campaigns).values(parsed.data).returning();
  await logAudit("campaign.created", "campaign", row.id, { name: row.name });
  return NextResponse.json(row, { status: 201 });
}
