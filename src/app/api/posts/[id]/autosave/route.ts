import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";

/** Autosave touches drafts only, so it can never change what a scheduled post will publish. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  const parsed = z.object({ content: z.string().max(63206), updatedAt: z.iso.datetime() }).safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  const [row] = await getDb().update(posts).set({ content: parsed.data.content, updatedAt: sql`greatest(clock_timestamp(), ${posts.updatedAt} + interval '1 millisecond')` })
    .where(and(eq(posts.id, id), eq(posts.status, "draft"), isNull(posts.deletedAt), sql`date_trunc('milliseconds', ${posts.updatedAt}) = ${parsed.data.updatedAt}::timestamptz`)).returning({ id: posts.id, updatedAt: posts.updatedAt });
  if (!row) return NextResponse.json({ error: "تغير المنشور في مكان آخر؛ أعد تحميل الصفحة" }, { status: 409 });
  return NextResponse.json(row);
}
