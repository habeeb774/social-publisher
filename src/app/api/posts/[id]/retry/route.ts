import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { classifyError } from "@/services/error-classes";
import { denyPostOutsideScope } from "@/services/access-scope";

/** Requeues a failed post for the next worker run. Uncertain outcomes require explicit confirmation. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request, true, "content.publish"); if (denied) return denied;
  const { id } = await params;
  const parsed = z.object({ confirmedNotPublished: z.boolean().optional() }).safeParse(await request.json().catch(() => ({})));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  const db = getDb();
  const [post] = await db.select().from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!post || post.status !== "failed") return NextResponse.json({ error: "المنشور ليس في حالة فشل" }, { status: 409 });
  const kind = classifyError(post.lastError);
  if (!kind.retryable && !(kind.key === "uncertain" && parsed.data.confirmedNotPublished)) return NextResponse.json({ error: `لا يمكن إعادة المحاولة: ${kind.hint}` }, { status: 409 });
  const [row] = await db.update(posts).set({ status: "scheduled", scheduledAt: new Date(), lastError: null, failedAt: null, updatedAt: new Date() }).where(and(eq(posts.id, id), eq(posts.status, "failed"))).returning();
  if (!row) return NextResponse.json({ error: "تغيرت حالة المنشور" }, { status: 409 });
  await logAudit("post.retry", "post", id, { class: kind.key });
  return NextResponse.json(row);
}
