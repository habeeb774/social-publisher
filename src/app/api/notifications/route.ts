import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { guard } from "@/services/api-guard";

export async function GET(request: NextRequest) {
  {const denied=await guard(request,request.method!=="GET","content.read");if(denied)return denied;}
  const db = getDb();
  const [rows, count] = await Promise.all([
    db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(20),
    db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(eq(notifications.isRead, false)),
  ]);
  return NextResponse.json({ unread: Number(count[0]?.n ?? 0), items: rows });
}

/** Marks all notifications as read. */
export async function POST(request: NextRequest) {
  {const denied=await guard(request,request.method!=="GET","content.read");if(denied)return denied;}
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  await getDb().update(notifications).set({ isRead: true }).where(eq(notifications.isRead, false));
  return NextResponse.json({ ok: true });
}
