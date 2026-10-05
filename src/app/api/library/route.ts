import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/db";
import { libraryItems } from "@/db/schema";
import { guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { normalizeTags } from "@/services/catalog";
import { LIBRARY_KINDS, libraryItemSchema } from "@/services/library";

export async function GET(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const kind = request.nextUrl.searchParams.get("kind");
  const q = request.nextUrl.searchParams.get("q")?.trim().replace(/[%_\\]/g, "");
  const rows = await getDb().select().from(libraryItems).where(and(kind && kind in LIBRARY_KINDS ? eq(libraryItems.kind, kind) : undefined, q ? or(ilike(libraryItems.title, `%${q}%`), ilike(libraryItems.body, `%${q}%`)) : undefined)).orderBy(desc(libraryItems.updatedAt)).limit(200);
  return NextResponse.json(rows);
}
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = libraryItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
  const [row] = await getDb().insert(libraryItems).values({ ...parsed.data, mediaUrl: parsed.data.mediaUrl ?? null, tags: normalizeTags(parsed.data.tags) }).returning();
  await logAudit("library.created", "library", row.id, { kind: row.kind });
  return NextResponse.json(row, { status: 201 });
}
