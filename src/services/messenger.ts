import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { currentActor, logAudit } from "./audit";
import { storedPageToken } from "./page-tokens";
import { getSetting, setSetting } from "./settings-store";

// Messenger inbox through the Graph API (needs pages_messaging on the page token).
// Replies are only allowed within Meta's 24-hour window after the customer's last message.
const version = () => process.env.META_GRAPH_VERSION || "v23.0";
type Row = Record<string, unknown>;
type GraphMsg = { id: string; message?: string; created_time: string; from?: { id: string; name?: string } };
type GraphConv = { id: string; updated_time: string; participants?: { data: Array<{ id: string; name?: string }> }; messages?: { data: GraphMsg[] } };
const WINDOW_MS = 24 * 3600000;

async function tokenFor(facebookPageId: string) {
  return (await storedPageToken(facebookPageId)) ?? process.env.META_PAGE_ACCESS_TOKEN?.trim() ?? null;
}
async function graph(path: string, token: string, init?: RequestInit) {
  const sep = path.includes("?") ? "&" : "?";
  const response = await fetch(`https://graph.facebook.com/${version()}${path}${sep}access_token=${encodeURIComponent(token)}`, { ...init, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({})) as Row & { error?: { code?: number; message?: string } };
  if (!response.ok || body.error) throw new Error(`MESSENGER_GRAPH_ERROR: (#${body.error?.code ?? response.status}) ${body.error?.message ?? "unknown"}`);
  return body;
}

/** Pulls recent conversations for every active Facebook page. Errors are recorded per page and never thrown. */
export async function syncMessenger() {
  const db = getDb();
  const pages = (await db.execute(sql`select id, name, facebook_page_id from facebook_pages where is_active and platform='facebook'`)).rows as Array<{ id: string; name: string; facebook_page_id: string }>;
  const status: Record<string, string | null> = {};
  let imported = 0;
  for (const page of pages) {
    const token = await tokenFor(page.facebook_page_id);
    if (!token) { status[page.name] = "NO_TOKEN"; continue; }
    try {
      const body = await graph(`/${page.facebook_page_id}/conversations?fields=id,updated_time,participants,messages.limit(15){id,message,created_time,from}&limit=25`, token);
      for (const conv of (body.data ?? []) as GraphConv[]) {
        const customer = conv.participants?.data.find((p) => p.id !== page.facebook_page_id);
        const messages = conv.messages?.data ?? [];
        const latest = messages[0];
        const lastCustomer = messages.find((m) => m.from?.id !== page.facebook_page_id);
        const latestFromCustomer = Boolean(latest && latest.from?.id !== page.facebook_page_id);
        const [row] = (await db.execute(sql`insert into messenger_conversations(page_id, facebook_conversation_id, participant_id, participant_name, last_message, last_message_at, last_customer_message_at, unread)
          values (${page.id}::uuid, ${conv.id}, ${customer?.id ?? null}, ${customer?.name ?? null}, ${latest?.message ?? ""}, ${latest?.created_time ?? conv.updated_time}, ${lastCustomer?.created_time ?? null}, ${latestFromCustomer})
          on conflict (facebook_conversation_id) do update set participant_name = excluded.participant_name, last_message = excluded.last_message,
            unread = case when excluded.last_message_at > coalesce(messenger_conversations.last_message_at, to_timestamp(0)) then ${latestFromCustomer} else messenger_conversations.unread end,
            last_message_at = excluded.last_message_at, last_customer_message_at = coalesce(excluded.last_customer_message_at, messenger_conversations.last_customer_message_at), updated_at = now()
          returning id`)).rows as Array<{ id: string }>;
        for (const m of messages) {
          const fromPage = m.from?.id === page.facebook_page_id;
          const res = await db.execute(sql`insert into messenger_messages(conversation_id, facebook_message_id, from_id, from_name, message, is_from_page, created_time)
            values (${row.id}::uuid, ${m.id}, ${m.from?.id ?? null}, ${m.from?.name ?? null}, ${m.message ?? ""}, ${fromPage}, ${m.created_time})
            on conflict (facebook_message_id) do nothing returning id`);
          if (res.rows.length && !fromPage) {
            imported++;
            await db.execute(sql`insert into notifications(type, title, message) values ('message_new', ${`رسالة جديدة من ${m.from?.name ?? "متابع"}`}, ${(m.message ?? "").slice(0, 300)})`);
          }
        }
      }
      status[page.name] = null;
    } catch (error) { status[page.name] = error instanceof Error ? error.message.slice(0, 200) : "MESSENGER_SYNC_FAILED"; }
  }
  await setSetting("messenger_status", { checkedAt: new Date().toISOString(), pages: status });
  return { imported, status };
}

export async function messengerStatus() {
  return getSetting<{ checkedAt: string; pages: Record<string, string | null> } | null>("messenger_status", null);
}

export async function listConversations(pageId = "") {
  const rows = await getDb().execute(sql`select c.id, c.participant_name, c.last_message, c.last_message_at, c.last_customer_message_at, c.unread, p.name as page_name
    from messenger_conversations c join facebook_pages p on p.id = c.page_id where (${pageId} = '' or c.page_id::text = ${pageId}) order by c.last_message_at desc nulls last limit 100`);
  return rows.rows;
}

export async function conversationDetail(id: string) {
  const db = getDb();
  const [conv] = (await db.execute(sql`select c.id, c.participant_name, c.last_customer_message_at, p.name as page_name from messenger_conversations c join facebook_pages p on p.id = c.page_id where c.id = ${id}::uuid`)).rows as Row[];
  if (!conv) throw new Error("CONVERSATION_NOT_FOUND");
  const messages = (await db.execute(sql`select id, from_name, message, is_from_page, created_time, sent_by from messenger_messages where conversation_id = ${id}::uuid order by created_time`)).rows;
  await db.execute(sql`update messenger_conversations set unread = false where id = ${id}::uuid`);
  const last = conv.last_customer_message_at ? new Date(String(conv.last_customer_message_at)).getTime() : 0;
  return { conversation: { ...conv, canReply: Date.now() - last < WINDOW_MS }, messages };
}

/** Sends a reply inside the 24-hour window and stores it locally. */
export async function replyMessage(id: string, text: string) {
  const db = getDb();
  const [conv] = (await db.execute(sql`select c.id, c.participant_id, c.last_customer_message_at, p.facebook_page_id, p.name from messenger_conversations c join facebook_pages p on p.id = c.page_id where c.id = ${id}::uuid`)).rows as Row[];
  if (!conv?.participant_id) throw new Error("CONVERSATION_NOT_FOUND");
  const last = conv.last_customer_message_at ? new Date(String(conv.last_customer_message_at)).getTime() : 0;
  if (Date.now() - last >= WINDOW_MS) throw new Error("MESSENGER_WINDOW_CLOSED: مرّ أكثر من 24 ساعة على آخر رسالة من العميل، ولا يسمح فيسبوك بالرد الآن");
  const token = await tokenFor(String(conv.facebook_page_id));
  if (!token) throw new Error("MESSENGER_NO_TOKEN");
  const body = await graph(`/${conv.facebook_page_id}/messages`, token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: { id: conv.participant_id }, messaging_type: "RESPONSE", message: { text } }) });
  const messageId = String(body.message_id ?? `local-${Date.now()}`);
  await db.execute(sql`insert into messenger_messages(conversation_id, facebook_message_id, from_name, message, is_from_page, created_time, sent_by) values (${id}::uuid, ${messageId}, ${String(conv.name)}, ${text}, true, now(), ${currentActor()}) on conflict (facebook_message_id) do nothing`);
  await db.execute(sql`update messenger_conversations set last_message = ${text}, last_message_at = now(), unread = false, updated_at = now() where id = ${id}::uuid`);
  await logAudit("messenger.reply_sent", "messenger_conversation", id, { messageId });
  return { ok: true, messageId };
}
