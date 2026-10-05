import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/services/api-guard";
import { runDiagnostics } from "@/services/diagnostics";

/** Non-destructive system diagnostics (GET = quick, POST = deep network checks). Never publishes. */
export async function GET(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  return NextResponse.json(await runDiagnostics(false));
}
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  return NextResponse.json(await runDiagnostics(true));
}
