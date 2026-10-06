import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { postNotes } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { currentActor, logAudit } from "@/services/audit";
import { denyPostOutsideScope } from "@/services/access-scope";

/** Internal notes stay inside the system and are never sent to Facebook. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json([], { status: 404 });
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  return NextResponse.json(await getDb().select().from(postNotes).where(eq(postNotes.postId, id)).orderBy(asc(postNotes.createdAt)));
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  const parsed = z.object({ body: z.string().trim().min(1).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "اكتب الملاحظة" }, { status: 400 });
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  const mentions = Array.from(new Set(parsed.data.body.match(/@[\p{L}\p{N}_.-]+/gu) ?? [])).map((m) => m.slice(1));
  const [note] = await getDb().insert(postNotes).values({ postId: id, body: parsed.data.body, author: currentActor(), mentions }).returning();
  await logAudit("post.note_added", "post", id);
  return NextResponse.json(note, { status: 201 });
}
