import { isPublishingEnabled } from "@/services/publishing-mode";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json(
      { status: "ok", database: "ok", publishingEnabled: isPublishingEnabled() },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
