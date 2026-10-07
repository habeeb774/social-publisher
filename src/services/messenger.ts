import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { currentActor, logAudit } from "./audit";
import { storedPageToken } from "./page-tokens";
import { messengerPageToken } from "./messenger-connection";
import { getSetting, setSetting } from "./settings-store";
import { listMetaAccounts } from "./meta-accounts";
import { planMessengerAutomation, recordMessengerAutomation } from "./messenger-automation";
import { messengerConversationLookup,messengerPageScope } from './messenger-access';

// Messenger inbox through the Graph API (needs pages_messaging on the page token).
// Replies are only allowed within Meta's 24-hour window after the customer's last message.
const version = () => process.env.META_GRAPH_VERSION || "v23.0";
type Row = Record<string, unknown>;
type ConversationDetailRow = { id: string; page_id: string; participant_name: string | null; last_customer_message_at: string | null; page_name: string };
type GraphMsg = { id: string; message?: string; created_time: string; from?: { id: string; name?: string } };
type GraphConv = { id: string; updated_time: string; participants?: { data: Array<{ id: string; name?: string }> }; messages?: { data: GraphMsg[] } };
const WINDOW_MS = 24 * 3600000;

async function tokenFor(facebookPageId: string) {
  return (await messengerPageToken(facebookPageId)) ?? (await storedPageToken(facebookPageId)) ?? process.env.META_PAGE_ACCESS_TOKEN?.trim() ?? null;
}
async function graph(path: string, token: string, init?: RequestInit) {
  const sep = path.includes("?") ? "&" : "?";
  const response = await fetch(`https://graph.facebook.com/${version()}${path}${sep}access_token=${encodeURIComponent(token)}`, { ...init, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({})) as Row & { error?: { code?: number; message?: string } };
  if (!response.ok || body.error) throw new Error(`MESSENGER_GRAPH_ERROR: (#${body.error?.code ?? response.status}) ${body.error?.message ?? "unknown"}`);
  return body;
}

/** Pulls recent conversations for every active Facebook page. Errors are recorded per page and never thrown. */
export async function syncMessenger(allowedLocalPageIds: string[] | null = null) {
  const db = getDb();
  const allPages = (await db.execute(sql`select id, name, facebook_page_id from facebook_pages where is_active and platform='facebook'`)).rows as Array<{ id: string; name: string; facebook_page_id: string }>;
  const pages = allowedLocalPageIds === null ? allPages : allPages.filter((page) => allowedLocalPageIds.includes(page.id));
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
        let row: { id: string } | undefined;
        const [exact] = (await db.execute(sql`select id from messenger_conversations where facebook_conversation_id=${conv.id} limit 1`)).rows as Array<{ id: string }>;
        if (exact) {
          row = exact;
          await db.execute(sql`update messenger_conversations set
            participant_id=coalesce(${customer?.id ?? null}, participant_id),
            participant_name=coalesce(${customer?.name ?? null}, participant_name),
            last_message=${latest?.message ?? ""},
            unread=case when ${latest?.created_time ?? conv.updated_time}::timestamptz > coalesce(last_message_at, to_timestamp(0)) then ${latestFromCustomer} else unread end,
            last_message_at=${latest?.created_time ?? conv.updated_time},
            last_customer_message_at=coalesce(${lastCustomer?.created_time ?? null}::timestamptz, last_customer_message_at),
            updated_at=now()
            where id=${exact.id}::uuid`);
        } else {
          const [byParticipant] = customer?.id ? (await db.execute(sql`select id from messenger_conversations where page_id=${page.id}::uuid and participant_id=${customer.id} order by updated_at desc limit 1`)).rows as Array<{ id: string }> : [];
          if (byParticipant) {
            row = byParticipant;
            await db.execute(sql`update messenger_conversations set
              facebook_conversation_id=${conv.id},
              participant_name=coalesce(${customer?.name ?? null}, participant_name),
              last_message=${latest?.message ?? ""},
              unread=case when ${latest?.created_time ?? conv.updated_time}::timestamptz > coalesce(last_message_at, to_timestamp(0)) then ${latestFromCustomer} else unread end,
              last_message_at=${latest?.created_time ?? conv.updated_time},
              last_customer_message_at=coalesce(${lastCustomer?.created_time ?? null}::timestamptz, last_customer_message_at),
              updated_at=now()
              where id=${byParticipant.id}::uuid`);
          } else {
            [row] = (await db.execute(sql`insert into messenger_conversations(page_id, facebook_conversation_id, participant_id, participant_name, last_message, last_message_at, last_customer_message_at, unread)
              values (${page.id}::uuid, ${conv.id}, ${customer?.id ?? null}, ${customer?.name ?? null}, ${latest?.message ?? ""}, ${latest?.created_time ?? conv.updated_time}, ${lastCustomer?.created_time ?? null}, ${latestFromCustomer})
              returning id`)).rows as Array<{ id: string }>;
          }
        }
        if (!row) continue;
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

export async function listConversations(pageId = "", accountId = "", q = "", state = "active",allowed:ReadonlySet<string>|null=new Set()) {
  const accounts = await listMetaAccounts();
  const selected = accounts.find((account) => account.id === accountId);
  const remoteCsv = selected?.pageIds.join(",") ?? "";
  const rows = await getDb().execute(sql`select c.id, c.page_id, c.participant_name, c.last_message, c.last_message_at, c.last_customer_message_at, c.unread, p.name as page_name, p.facebook_page_id,
      coalesce((select case a.action when 'messenger.resolved' then 'resolved' when 'messenger.archived' then 'archived' when 'messenger.reopened' then 'open' else 'open' end
        from activity_logs a where a.entity_type='messenger_conversation' and a.entity_id=c.id
          and a.action in ('messenger.resolved','messenger.archived','messenger.reopened')
        order by a.created_at desc limit 1),'open') as stored_state,
      (select a.created_at from activity_logs a where a.entity_type='messenger_conversation' and a.entity_id=c.id
          and a.action in ('messenger.resolved','messenger.archived','messenger.reopened')
        order by a.created_at desc limit 1) as state_at
    from messenger_conversations c join facebook_pages p on p.id = c.page_id
    where (${pageId} = '' or c.page_id::text = ${pageId})
      and ${messengerPageScope(allowed)}
      and (${accountId} = '' or p.facebook_page_id = any(string_to_array(${remoteCsv}, ',')))
      and (${q} = '' or coalesce(c.participant_name,'') ilike ${`%${q}%`} or coalesce(c.last_message,'') ilike ${`%${q}%`})
    order by c.last_message_at desc nulls last limit 100`);
  return rows.rows.map((row) => {
    const record = row as Row;
    const stateAt = record.state_at ? new Date(String(record.state_at)).getTime() : 0;
    const lastAt = record.last_message_at ? new Date(String(record.last_message_at)).getTime() : 0;
    const unread = Boolean(record.unread);
    const effectiveState = unread && lastAt > stateAt ? "open" : String(record.stored_state ?? "open");
    return { ...record, unread, state: effectiveState };
  }).filter((row) => state === "all" ? true : state === "unread" ? row.unread : state === "archived" ? row.state === "archived" : row.state !== "archived");
}

export async function setMessengerConversationState(id: string, state: "resolved" | "open" | "archived") {
  const db = getDb();
  const [row] = (await db.execute(sql`select id from messenger_conversations where id=${id}::uuid limit 1`)).rows as Array<{ id: string }>;
  if (!row) throw new Error("CONVERSATION_NOT_FOUND");
  const action = state === "resolved" ? "messenger.resolved" : state === "archived" ? "messenger.archived" : "messenger.reopened";
  await logAudit(action, "messenger_conversation", id, { state });
  if (state !== "open") await db.execute(sql`update messenger_conversations set unread=false,updated_at=now() where id=${id}::uuid`);
  return { ok: true, state };
}

export async function setMessengerUnread(id: string, unread: boolean) {
  const result = await getDb().execute(sql`update messenger_conversations set unread=${unread},updated_at=now() where id=${id}::uuid returning id`);
  if (!result.rows.length) throw new Error("CONVERSATION_NOT_FOUND");
  await logAudit(unread ? "messenger.marked_unread" : "messenger.marked_read", "messenger_conversation", id, {});
  return { ok: true, unread };
}

export async function messengerCatalog() {
  const db = getDb();
  const [pages, accounts] = await Promise.all([
    db.execute(sql`select id,name,facebook_page_id from facebook_pages where is_active and platform='facebook' order by name`),
    listMetaAccounts(),
  ]);
  return {
    accounts: accounts.map((account) => ({ id: account.id, name: account.name, status: account.status })),
    pages: (pages.rows as Array<{ id: string; name: string; facebook_page_id: string }>).map((page) => {
      const account = accounts.find((item) => item.pageIds.includes(page.facebook_page_id));
      return { id: page.id, name: page.name, accountId: account?.id ?? null, accountName: account?.name ?? null };
    }),
  };
}

export async function conversationDetail(id: string,allowed:ReadonlySet<string>|null,options:{markRead?:boolean;includeMessages?:boolean}={}) {
  const db = getDb();
  const [conv] = (await db.execute(messengerConversationLookup(id,allowed))).rows as ConversationDetailRow[];
  if (!conv) throw new Error("CONVERSATION_NOT_FOUND");
  const messages = options.includeMessages===false?[]:(await db.execute(sql`select m.id,m.from_name,m.message,m.is_from_page,m.created_time,m.sent_by
    from messenger_messages m join messenger_conversations c on c.id=m.conversation_id
    where c.id=${id}::uuid and ${messengerPageScope(allowed)} order by m.created_time`)).rows;
  if(options.markRead!==false)await db.execute(sql`update messenger_conversations set unread=false where id=${id}::uuid and ${messengerPageScope(allowed,'page_id')}`);
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


export type MessengerWebhookMessage = {
  senderId: string;
  recipientId: string;
  timestamp: number;
  mid: string;
  text?: string;
  isEcho?: boolean;
};

/** Ingests a real-time Messenger webhook event into the same inbox used by polling sync. */
export async function ingestMessengerWebhook(pageRemoteId: string, event: MessengerWebhookMessage) {
  const db = getDb();
  const [page] = (await db.execute(sql`select id,name,facebook_page_id from facebook_pages where platform='facebook' and is_active and facebook_page_id=${pageRemoteId} limit 1`)).rows as Array<{ id: string; name: string; facebook_page_id: string }>;
  if (!page) return { status: "ignored" as const, reason: "PAGE_NOT_CONNECTED" };

  const fromPage = Boolean(event.isEcho || event.senderId === pageRemoteId);
  const participantId = fromPage ? event.recipientId : event.senderId;
  if (!participantId || participantId === pageRemoteId) return { status: "ignored" as const, reason: "PARTICIPANT_MISSING" };

  let [conversation] = (await db.execute(sql`select id,facebook_conversation_id from messenger_conversations where page_id=${page.id}::uuid and participant_id=${participantId} order by updated_at desc limit 1`)).rows as Array<{ id: string; facebook_conversation_id: string }>;
  if (!conversation) {
    [conversation] = (await db.execute(sql`insert into messenger_conversations(
      page_id,facebook_conversation_id,participant_id,last_message,last_message_at,last_customer_message_at,unread
    ) values (
      ${page.id}::uuid,${`webhook:${pageRemoteId}:${participantId}`},${participantId},${event.text ?? ""},to_timestamp(${event.timestamp}/1000.0),
      ${fromPage ? null : new Date(event.timestamp).toISOString()}::timestamptz,${!fromPage}
    ) returning id,facebook_conversation_id`)).rows as Array<{ id: string; facebook_conversation_id: string }>;
  } else {
    await db.execute(sql`update messenger_conversations set
      last_message=${event.text ?? ""},
      last_message_at=to_timestamp(${event.timestamp}/1000.0),
      last_customer_message_at=case when ${fromPage} then last_customer_message_at else to_timestamp(${event.timestamp}/1000.0) end,
      unread=case when ${fromPage} then unread else true end,
      updated_at=now()
      where id=${conversation.id}::uuid`);
  }

  const inserted = await db.execute(sql`insert into messenger_messages(
    conversation_id,facebook_message_id,from_id,message,is_from_page,created_time
  ) values (
    ${conversation.id}::uuid,${event.mid},${event.senderId},${event.text ?? ""},${fromPage},to_timestamp(${event.timestamp}/1000.0)
  ) on conflict (facebook_message_id) do nothing returning id`);

  if (inserted.rows.length && !fromPage) {
    await db.execute(sql`insert into notifications(type,title,message) values(
      'message_new','رسالة ماسنجر جديدة',${(event.text ?? "(مرفق)").slice(0,300)}
    )`);
    const plan = await planMessengerAutomation({
      conversationId: conversation.id,
      pageId: page.id,
      message: event.text ?? "",
    });
    if (plan.matched) {
      if (plan.rule.requireApproval) {
        await recordMessengerAutomation(conversation.id, plan.rule.id, "approval", { preview: plan.rule.replyText.slice(0, 200) });
        await db.execute(sql`insert into notifications(type,title,message) values(
          'messenger_approval','رد Messenger بانتظار المراجعة',${plan.rule.replyText.slice(0,300)}
        )`);
      } else {
        try {
          const sent = await replyMessage(conversation.id, plan.rule.replyText);
          await recordMessengerAutomation(conversation.id, plan.rule.id, "sent", { messageId: sent.messageId });
        } catch (error) {
          const message = error instanceof Error ? error.message : "MESSENGER_AUTO_REPLY_FAILED";
          await recordMessengerAutomation(conversation.id, plan.rule.id, "failed", { error: message.slice(0, 300) });
          await db.execute(sql`insert into notifications(type,title,message) values(
            'messenger_auto_failed','تعذر إرسال رد Messenger تلقائي',${message.slice(0,300)}
          )`);
        }
      }
    } else if (plan.reason === "SENSITIVE_HUMAN_REVIEW") {
      await db.execute(sql`insert into notifications(type,title,message) values(
        'messenger_review','رسالة Messenger تحتاج مراجعة بشرية',${(event.text ?? "").slice(0,300)}
      )`);
    }
  }
  await setSetting("messenger_status", {
    checkedAt: new Date().toISOString(),
    pages: { [page.name]: null },
    source: "webhook",
  });
  return { status: "processed" as const, inserted: inserted.rows.length > 0, conversationId: conversation.id };
}
