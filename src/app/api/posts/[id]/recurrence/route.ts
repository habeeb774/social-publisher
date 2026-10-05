import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { postRecurrences, posts } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { materializeRecurrences } from "@/services/recurrence";

const body = z.object({ frequency: z.enum(["weekly", "monthly"]), interval: z.number().int().min(1).max(12).default(1), firstRunAt: z.coerce.date(), endsAt: z.coerce.date().nullable().optional(), maxOccurrences: z.number().int().min(1).max(260).nullable().optional() });

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json([], { status: 404 });
  return NextResponse.json(await getDb().select().from(postRecurrences).where(eq(postRecurrences.sourcePostId, id)));
}

/** Creates a recurrence rule. The source post is a template; every occurrence becomes its own post. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
  const d = parsed.data;
  if (d.firstRunAt.getTime() <= Date.now() + 60000) return NextResponse.json({ error: "أول موعد يجب أن يكون في المستقبل" }, { status: 422 });
  if (!d.endsAt && !d.maxOccurrences) return NextResponse.json({ error: "حدد تاريخ نهاية أو عدد مرات؛ التكرار بلا نهاية غير مسموح" }, { status: 422 });
  const db = getDb();
  const [source] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!source) return NextResponse.json({ error: "المنشور غير موجود" }, { status: 404 });
  const [rule] = await db.insert(postRecurrences).values({ sourcePostId: id, frequency: d.frequency, interval: d.interval, nextRunAt: d.firstRunAt, endsAt: d.endsAt ?? null, maxOccurrences: d.maxOccurrences ?? null }).returning();
  await logAudit("recurrence.created", "post", id, { frequency: d.frequency, interval: d.interval });
  await materializeRecurrences();
  return NextResponse.json(rule, { status: 201 });
}

/** Stops a rule. Already-created instances stay scheduled and can be edited individually. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  const ruleId = request.nextUrl.searchParams.get("rule");
  if (!isUuid(id) || !isUuid(ruleId)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  await getDb().update(postRecurrences).set({ active: false, updatedAt: new Date() }).where(and(eq(postRecurrences.id, ruleId), eq(postRecurrences.sourcePostId, id)));
  await logAudit("recurrence.stopped", "post", id, { ruleId });
  return NextResponse.json({ ok: true });
}
