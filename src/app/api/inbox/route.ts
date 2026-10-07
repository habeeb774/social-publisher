import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/services/api-guard";
import { currentUser } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import * as comments from "@/services/comments/store";
import { listConversations } from "@/services/messenger";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "content.read");
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const source = ["all", "comments", "messenger"].includes(params.get("source") ?? "") ? params.get("source")! : "all";
  const account = (params.get("account") ?? "").trim().slice(0, 200);
  const page = (params.get("page") ?? "").trim().slice(0, 100);
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const messengerState = ["active","unread","archived","all"].includes(params.get("state") ?? "") ? params.get("state")! : "active";

  const commentParams = new URLSearchParams();
  commentParams.set("status", "all");
  if (account) commentParams.set("account", account);
  if (page) commentParams.set("page", page);
  if (q) commentParams.set("q", q);

  const allowed=await allowedPageIds(user);
  const [commentResult, messengerRows, catalog] = await Promise.all([
    source === "messenger" ? Promise.resolve({ items: [] as Row[] }) : comments.inbox(commentParams),
    source === "comments" ? Promise.resolve([] as Row[]) : listConversations(page, account, q, messengerState,allowed) as Promise<Row[]>,
    comments.inboxCatalog(user.id),
  ]);

  const commentItems = (commentResult.items as Row[]).filter((item) => allowed === null || allowed.has(String(item.page_id))).map((item) => ({
    kind: "comment" as const,
    id: String(item.id),
    person: item.author_name ? String(item.author_name) : "متابع",
    preview: String(item.message ?? ""),
    pageName: String(item.page_name ?? ""),
    pageId: String(item.page_id ?? ""),
    occurredAt: String(item.created_time ?? ""),
    unread: ["new", "unread"].includes(String(item.status ?? "")),
    needsReply: Boolean(item.needs_reply),
    sentiment: String(item.sentiment ?? "neutral"),
  }));

  const messageItems = messengerRows
    .filter((item) => allowed === null || allowed.has(String(item.page_id)))
    .map((item) => ({
      kind: "messenger" as const,
      id: String(item.id),
      person: item.participant_name ? String(item.participant_name) : "متابع",
      preview: String(item.last_message ?? ""),
      pageName: String(item.page_name ?? ""),
      pageId: String(item.page_id ?? ""),
      occurredAt: String(item.last_message_at ?? ""),
      unread: Boolean(item.unread),
      needsReply: Boolean(item.unread),
      sentiment: "neutral",
      state: String(item.state ?? "open"),
    }));

  const items = [...commentItems, ...messageItems]
    .sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime())
    .slice(0, 100);

  return NextResponse.json({
    items,
    catalog: {
      accounts: (catalog.accounts ?? []).filter((account: { id: string }) => {
        if (allowed === null) return true;
        return (catalog.pages ?? []).some((page: { id: string; account_id?: string | null }) => page.account_id === account.id && allowed.has(page.id));
      }),
      pages: (catalog.pages ?? []).filter((page: { id: string }) => allowed === null || allowed.has(page.id)),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
