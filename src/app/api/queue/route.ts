import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { posts, queueSlots } from "@/db/schema";
import { errorResponse, guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { recomputeQueue } from "@/services/post-ops";
import { isValidSlot } from "@/services/queue-slots";

export async function GET(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const db = getDb();
  const [slots, queued] = await Promise.all([
    db.select().from(queueSlots).orderBy(asc(queueSlots.weekday), asc(queueSlots.time)),
    db.select({ id: posts.id, content: posts.content, status: posts.status, scheduledAt: posts.scheduledAt, queueOrder: posts.queueOrder }).from(posts).where(and(eq(posts.inQueue, true), inArray(posts.status, ["scheduled", "pending_approval"]), isNull(posts.deletedAt))).orderBy(asc(posts.queueOrder)).limit(200),
  ]);
  return NextResponse.json({ slots, queued });
}

const slotsBody = z.object({ slots: z.array(z.object({ weekday: z.number().int().min(0).max(6), time: z.string() })).max(100) });
/** Replaces the weekly slot plan and reflows queued posts onto it. */
export async function PUT(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = slotsBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.slots.every(isValidSlot)) return NextResponse.json({ error: "أوقات غير صالحة" }, { status: 400 });
  try {
    const db = getDb();
    const unique = Array.from(new Map(parsed.data.slots.map((s) => [`${s.weekday}-${s.time}`, s])).values());
    await db.delete(queueSlots);
    if (unique.length) await db.insert(queueSlots).values(unique);
    await recomputeQueue();
    await logAudit("queue.slots_updated", "queue", null, { count: unique.length });
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

/** Reorders the queue; publish times are recalculated from the new order. */
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = z.object({ order: z.array(z.uuid()).max(200) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ترتيب غير صالح" }, { status: 400 });
  try {
    const assigned = await recomputeQueue(parsed.data.order);
    await logAudit("queue.reordered", "queue", null, { count: assigned.length });
    return NextResponse.json({ assigned });
  } catch (error) { return errorResponse(error); }
}
