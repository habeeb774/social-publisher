import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { currentUser } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { conversationDetail, listConversations, messengerCatalog, messengerStatus, replyMessage, syncMessenger } from "@/services/messenger";

export const dynamic = "force-dynamic";
const fail = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "تعذر التنفيذ" }, { status: 400 });

export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "content.read");
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const allowed = await allowedPageIds(user);
  const params = request.nextUrl.searchParams;
  try {
    const id = params.get("id");
    if (id) {
      const detail = await conversationDetail(z.uuid().parse(id));
      if (allowed !== null && !allowed.has(String(detail.conversation.page_id))) return NextResponse.json({ error: "ليست لديك صلاحية لهذه الصفحة" }, { status: 403 });
      return NextResponse.json(detail);
    }
    const [allItems, status, catalog] = await Promise.all([listConversations(params.get("page") ?? "", params.get("account") ?? ""), messengerStatus(), messengerCatalog()]);
    const items = allowed === null ? allItems : allItems.filter((item) => allowed.has(String((item as Record<string, unknown>).page_id)));
    const visiblePages = allowed === null ? catalog.pages : catalog.pages.filter((page) => allowed.has(page.id));
    const visibleAccounts = catalog.accounts.filter((account) => visiblePages.some((page) => page.accountId === account.id));
    return NextResponse.json({ items, status, catalog: { accounts: visibleAccounts, pages: visiblePages } });
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
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const allowed = await allowedPageIds(user);
    if (parsed.data.action === "sync") {
      return NextResponse.json(await syncMessenger(allowed === null ? null : Array.from(allowed)));
    }
    const detail = await conversationDetail(parsed.data.id);
    if (allowed !== null && !allowed.has(String(detail.conversation.page_id))) return NextResponse.json({ error: "ليست لديك صلاحية لهذه الصفحة" }, { status: 403 });
    return NextResponse.json(await replyMessage(parsed.data.id, parsed.data.text));
  } catch (error) { return fail(error); }
}
