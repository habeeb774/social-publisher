import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { conversationDetail, listConversations, messengerStatus, replyMessage, syncMessenger } from "@/services/messenger";

export const dynamic = "force-dynamic";
const fail = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "تعذر التنفيذ" }, { status: 400 });

export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "content.read");
  if (denied) return denied;
  const params = request.nextUrl.searchParams;
  try {
    const id = params.get("id");
    if (id) return NextResponse.json(await conversationDetail(z.uuid().parse(id)));
    const [items, status] = await Promise.all([listConversations(params.get("page") ?? ""), messengerStatus()]);
    return NextResponse.json({ items, status });
  } catch (error) { return fail(error); }
}

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("reply"), id: z.uuid(), text: z.string().trim().min(1).max(2000) }),
]);
export async function POST(request: NextRequest) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const denied = await guard(request, true, parsed.data.action === "reply" ? "inbox.reply" : "inbox.manage");
  if (denied) return denied;
  try {
    return NextResponse.json(parsed.data.action === "sync" ? await syncMessenger() : await replyMessage(parsed.data.id, parsed.data.text));
  } catch (error) { return fail(error); }
}
