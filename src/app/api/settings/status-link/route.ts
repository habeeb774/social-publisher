import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/services/api-guard";
import { statusKey } from "@/services/public-status";

export const dynamic = "force-dynamic";
const link = (request: NextRequest, key: string) => `${request.nextUrl.origin}/s/${key}`;
export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "settings.manage"); if (denied) return denied;
  return NextResponse.json({ url: link(request, await statusKey()) });
}
/** Rotating invalidates the old link immediately. */
export async function POST(request: NextRequest) {
  const denied = await guard(request, true, "settings.manage"); if (denied) return denied;
  return NextResponse.json({ url: link(request, await statusKey(true)) });
}
