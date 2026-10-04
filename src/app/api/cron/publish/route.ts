import { NextResponse } from "next/server";
import { publishDuePosts } from "@/services/publisher";

async function run(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ processed: await publishDuePosts() });
  } catch {
    return NextResponse.json({ error: "تعذر تشغيل عامل النشر" }, { status: 500 });
  }
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
