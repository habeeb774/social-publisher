import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { currentUser } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { conversationDetail, listConversations, messengerCatalog, messengerStatus, replyMessage, setMessengerConversationState, setMessengerUnread, syncMessenger } from "@/services/messenger";

export const dynamic = "force-dynamic";
const fail = (error: unknown) => {
  const message=error instanceof Error?error.message:'';
  if(message==='CONVERSATION_NOT_FOUND')return NextResponse.json({error:'المحادثة غير موجودة أو غير متاحة لك.'},{status:404});
  if(error instanceof z.ZodError)return NextResponse.json({error:'بيانات المحادثة غير صالحة.'},{status:400});
  if(message.startsWith('MESSENGER_WINDOW_CLOSED'))return NextResponse.json({error:'مرّ أكثر من 24 ساعة على آخر رسالة من العميل؛ لا يمكن الرد الآن.'},{status:409});
  if(message==='MESSENGER_NO_TOKEN')return NextResponse.json({error:'اتصال Messenger غير جاهز. أعد ربط الصفحة.'},{status:409});
  console.error('Messenger request unavailable',{code:'MESSENGER_REQUEST_UNAVAILABLE'});
  return NextResponse.json({error:'تعذر تنفيذ الطلب. حاول مجددًا.'},{status:503});
};

export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "content.read");
  if (denied) return denied;
  try {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const allowed = await allowedPageIds(user);
  const params = request.nextUrl.searchParams;
    const id = params.get("id");
    if (id) {
      const detail = await conversationDetail(z.uuid().parse(id),allowed);
      return NextResponse.json(detail,{headers:{'Cache-Control':'private, no-store'}});
    }
    const [allItems, status, catalog] = await Promise.all([listConversations(params.get("page") ?? "", params.get("account") ?? "", (params.get("q") ?? "").slice(0,100), params.get("state") ?? "active",allowed), allowed===null?messengerStatus():Promise.resolve(null), messengerCatalog()]);
    const items = allowed === null ? allItems : allItems.filter((item) => allowed.has(String((item as Record<string, unknown>).page_id)));
    const visiblePages = allowed === null ? catalog.pages : catalog.pages.filter((page) => allowed.has(page.id));
    const visibleAccounts = catalog.accounts.filter((account) => visiblePages.some((page) => page.accountId === account.id));
    return NextResponse.json({ items, status, catalog: { accounts: visibleAccounts, pages: visiblePages } },{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) { return fail(error); }
}

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("reply"), id: z.uuid(), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("state"), id: z.uuid(), value: z.enum(["resolved","open","archived"]) }),
  z.object({ action: z.literal("unread"), id: z.uuid(), value: z.boolean() }),
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
    await conversationDetail(parsed.data.id,allowed,{markRead:false,includeMessages:false});
    if (parsed.data.action === "reply") return NextResponse.json(await replyMessage(parsed.data.id, parsed.data.text));
    if (parsed.data.action === "state") return NextResponse.json(await setMessengerConversationState(parsed.data.id, parsed.data.value));
    return NextResponse.json(await setMessengerUnread(parsed.data.id, parsed.data.value));
  } catch (error) { return fail(error); }
}
