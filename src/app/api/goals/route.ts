import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { contentGoals } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { POST_CATEGORIES } from "@/services/catalog";

const body = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), category: z.enum(POST_CATEGORIES).nullable().optional(), target: z.number().int().min(1).max(1000) });
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "هدف غير صالح" }, { status: 400 });
  const db = getDb();
  const category = parsed.data.category ?? null;
  // One goal per month+category: replace if it exists.
  const existing = await db.select({ id: contentGoals.id }).from(contentGoals).where(eq(contentGoals.month, parsed.data.month));
  const rows = await db.select().from(contentGoals).where(eq(contentGoals.month, parsed.data.month));
  const same = rows.find((r) => (r.category ?? null) === category);
  const [row] = same ? await db.update(contentGoals).set({ target: parsed.data.target }).where(eq(contentGoals.id, same.id)).returning() : await db.insert(contentGoals).values({ month: parsed.data.month, category, target: parsed.data.target }).returning();
  await logAudit("goal.saved", "goal", row.id, { month: row.month, category, target: row.target, existing: existing.length });
  return NextResponse.json(row, { status: 201 });
}
export async function DELETE(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  await getDb().delete(contentGoals).where(and(eq(contentGoals.id, id)));
  await logAudit("goal.deleted", "goal", id);
  return NextResponse.json({ ok: true });
}
