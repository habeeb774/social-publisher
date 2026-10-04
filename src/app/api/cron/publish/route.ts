import { NextResponse } from "next/server";
import { publishDuePosts } from "@/services/publisher";
import { getDb } from "@/db";
import { schedulerRuns } from "@/db/schema";

async function run(request: Request) {
  // Dashboard-entered values often carry stray whitespace or quotes; normalize both sides before comparing.
  const clean = (value: string | null | undefined) => (value ?? "").trim().replace(/^["']|["']$/g, "").trim();
  const expected = clean(process.env.CRON_SECRET);
  const provided = clean(clean(request.headers.get("authorization")).replace(/^bearer\s+/i, ""));
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = new Date();
  try {
    const results = await publishDuePosts();
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    await getDb().insert(schedulerRuns).values({ finishedAt, processedCount: results.length, publishedCount: results.filter((item) => item.status === "published").length, failedCount: results.filter((item) => item.status === "failed").length, durationMs, status: "success" });
    return NextResponse.json({ success: true, processed: results.length, published_count: results.filter((item) => item.status === "published").length, failed_count: results.filter((item) => item.status === "failed").length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker failed";
    try { await getDb().insert(schedulerRuns).values({ finishedAt: new Date(), durationMs: Date.now() - startedAt.getTime(), status: "failed", errorMessage: message }); } catch { /* preserve the worker error response */ }
    return NextResponse.json({ error: "تعذر تشغيل عامل النشر" }, { status: 500 });
  }
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
