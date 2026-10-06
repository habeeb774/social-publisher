import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { disconnectMetaAccount, listMetaAccounts } from "@/services/meta-accounts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "settings.manage");
  if (denied) return denied;
  return NextResponse.json({ accounts: await listMetaAccounts() }, { headers: { "Cache-Control": "no-store" } });
}

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disconnect"), accountId: z.string().trim().min(1).max(200) }),
]);

export async function POST(request: NextRequest) {
  const denied = await guard(request, true, "settings.manage");
  if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  try {
    return NextResponse.json(await disconnectMetaAccount(parsed.data.accountId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "META_ACCOUNT_ACTION_FAILED";
    return NextResponse.json({ error: message }, { status: message === "META_ACCOUNT_NOT_FOUND" ? 404 : 500 });
  }
}
