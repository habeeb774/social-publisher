import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { savedFilters } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";

const SCOPES = ["posts", "calendar"] as const;
export async function GET(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const scope = request.nextUrl.searchParams.get("scope");
  const rows = await getDb().select().from(savedFilters).where(SCOPES.includes(scope as typeof SCOPES[number]) ? eq(savedFilters.scope, scope!) : undefined).orderBy(desc(savedFilters.createdAt)).limit(50);
  return NextResponse.json(rows);
}
/** Stores a named query string (e.g. "status=scheduled&page=…"). Only known filter keys are kept. */
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = z.object({ name: z.string().trim().min(1).max(80), scope: z.enum(SCOPES), query: z.string().max(500) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const allowed = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(parsed.data.query)) if (["status", "page", "category", "campaign", "month"].includes(k)) allowed.set(k, v.slice(0, 64));
  const [row] = await getDb().insert(savedFilters).values({ name: parsed.data.name, scope: parsed.data.scope, query: allowed.toString() }).returning();
  return NextResponse.json(row, { status: 201 });
}
export async function DELETE(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  await getDb().delete(savedFilters).where(eq(savedFilters.id, id));
  return NextResponse.json({ ok: true });
}
