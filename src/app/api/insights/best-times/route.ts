import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/services/api-guard";
import { bestTimes } from "@/services/best-times";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "content.read");
  if (denied) return denied;
  return NextResponse.json(await bestTimes(request.nextUrl.searchParams.get("refresh") === "1"));
}
