import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLogs, facebookPages } from "@/db/schema";
import { ingestComment } from "@/services/comments/store";
import type { RemoteComment } from "@/services/comments/provider";
import { storedPageToken } from "@/services/page-tokens";

const version = () => process.env.META_GRAPH_VERSION?.trim() || "v23.0";
const graphBase = () => `https://graph.facebook.com/${version()}`;

export function metaWebhookConfigured() {
  return Boolean(
    process.env.META_APP_ID?.trim() &&
    process.env.META_APP_SECRET?.trim() &&
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() &&
    process.env.APP_URL?.trim()
  );
}

export function metaWebhookCallbackUrl() {
  const base = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (!base) throw new Error("APP_URL_MISSING");
  return `${base}/api/meta/webhook`;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyMetaWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret || !signature) return false;
  const [algorithm, value] = signature.split("=");
  if (!value || !["sha256", "sha1"].includes(algorithm)) return false;
  const expected = createHmac(algorithm, secret).update(rawBody).digest("hex");
  return safeEqual(value, expected);
}

export function verifyMetaWebhookChallenge(mode: string | null, token: string | null) {
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  return Boolean(expected && mode === "subscribe" && token && safeEqual(token, expected));
}

type FeedValue = {
  item?: string;
  verb?: string;
  post_id?: string;
  comment_id?: string;
  parent_id?: string;
  message?: string;
  created_time?: number | string;
  is_hidden?: boolean;
  from?: { id?: string; name?: string };
};

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{ field?: string; value?: FeedValue }>;
  }>;
};

async function audit(status: "received" | "processed" | "ignored" | "failed", metadata: Record<string, unknown>) {
  try {
    await getDb().insert(activityLogs).values({
      action: `meta.webhook.${status}`,
      entityType: "meta_webhook",
      entityId: null,
      metadata: { actor: "meta-webhook", ...metadata },
    });
  } catch (error) {
    console.error("Webhook audit failed", { status, error: error instanceof Error ? error.message : String(error) });
  }
}

function createdAt(value: number | string | undefined, fallbackSeconds?: number) {
  if (typeof value === "number") return new Date(value * 1000);
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric * 1000);
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fallbackSeconds ? new Date(fallbackSeconds * 1000) : new Date();
}

async function pageRow(pageRemoteId: string) {
  const [page] = await getDb().select({
    id: facebookPages.id,
    name: facebookPages.name,
    facebookPageId: facebookPages.facebookPageId,
  }).from(facebookPages).where(and(
    eq(facebookPages.facebookPageId, pageRemoteId),
    eq(facebookPages.platform, "facebook"),
    eq(facebookPages.isActive, true),
  )).limit(1);
  return page ?? null;
}

async function markRemoved(pageRemoteId: string, commentId: string) {
  const page = await pageRow(pageRemoteId);
  if (!page) return "page_not_found" as const;
  const db = getDb();
  const result = await db.execute(sql`
    update facebook_comments
    set is_hidden=true,status='hidden',needs_reply=false,last_synced_at=now(),updated_at=now()
    where page_id=${page.id}::uuid and facebook_comment_id=${commentId}
    returning facebook_comment_id
  `);
  return result.rows.length > 0 ? "removed" as const : "not_found" as const;
}

async function ingestFeedChange(pageRemoteId: string, entryTime: number | undefined, value: FeedValue) {
  if (value.item !== "comment") return { status: "ignored" as const, reason: "NOT_COMMENT" };
  const commentId = value.comment_id?.trim();
  if (!commentId) return { status: "ignored" as const, reason: "COMMENT_ID_MISSING" };
  const verb = (value.verb ?? "add").toLowerCase();
  if (verb === "remove" || verb === "removed") {
    return { status: "processed" as const, result: await markRemoved(pageRemoteId, commentId), commentId, verb };
  }
  if (!["add", "added", "edit", "edited"].includes(verb)) {
    return { status: "ignored" as const, reason: `UNSUPPORTED_VERB:${verb}`, commentId };
  }

  const page = await pageRow(pageRemoteId);
  if (!page) return { status: "ignored" as const, reason: "PAGE_NOT_CONNECTED", commentId };

  const parent = value.parent_id && value.parent_id !== value.post_id ? value.parent_id : null;
  const remote: RemoteComment = {
    id: commentId,
    pageId: pageRemoteId,
    postId: value.post_id ?? null,
    parentId: parent,
    message: value.message ?? "",
    createdTime: createdAt(value.created_time, entryTime),
    hidden: Boolean(value.is_hidden),
    authorId: value.from?.id ?? null,
    authorName: value.from?.name ?? null,
    authorAvatar: null,
    permalink: null,
  };
  const inserted = await ingestComment(page.id, remote, page.facebookPageId);
  return { status: "processed" as const, result: inserted ? "inserted" : "duplicate_or_updated", commentId, verb };
}

export async function processMetaWebhook(payload: MetaWebhookPayload) {
  await audit("received", { object: payload.object ?? null, entries: payload.entry?.length ?? 0 });
  if (payload.object !== "page" || !Array.isArray(payload.entry)) {
    await audit("ignored", { reason: "UNSUPPORTED_OBJECT", object: payload.object ?? null });
    return { processed: 0, ignored: 1, failed: 0 };
  }

  let processed = 0, ignored = 0, failed = 0;
  for (const entry of payload.entry) {
    const pageRemoteId = entry.id?.trim();
    if (!pageRemoteId) { ignored++; continue; }
    for (const change of entry.changes ?? []) {
      if (change.field !== "feed" || !change.value) { ignored++; continue; }
      try {
        const result = await ingestFeedChange(pageRemoteId, entry.time, change.value);
        if (result.status === "processed") {
          processed++;
          await audit("processed", { pageRemoteId, field: change.field, ...result });
        } else {
          ignored++;
          await audit("ignored", { pageRemoteId, field: change.field, ...result });
        }
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        await audit("failed", { pageRemoteId, field: change.field, error: message.slice(0, 500) });
      }
    }
  }
  return { processed, ignored, failed };
}

async function graph(path: string, init?: RequestInit) {
  const response = await fetch(`${graphBase()}${path}`, { ...init, signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => ({})) as { success?: boolean; error?: { message?: string; code?: number }; data?: unknown[] };
  if (!response.ok || body.error) throw new Error(`META_WEBHOOK_SETUP_ERROR: (#${body.error?.code ?? "?"}) ${body.error?.message ?? `HTTP ${response.status}`}`);
  return body;
}

export async function setupMetaWebhook() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!appId || !appSecret || !verifyToken) throw new Error("META_WEBHOOK_NOT_CONFIGURED");
  const callbackUrl = metaWebhookCallbackUrl();
  const appAccessToken = `${appId}|${appSecret}`;

  await graph(`/${appId}/subscriptions`, {
    method: "POST",
    body: new URLSearchParams({
      object: "page",
      callback_url: callbackUrl,
      fields: "feed",
      include_values: "true",
      verify_token: verifyToken,
      access_token: appAccessToken,
    }),
  });

  const pages = await getDb().select({
    id: facebookPages.id,
    name: facebookPages.name,
    facebookPageId: facebookPages.facebookPageId,
  }).from(facebookPages).where(and(
    eq(facebookPages.platform, "facebook"),
    eq(facebookPages.isActive, true),
    isNotNull(facebookPages.accessTokenEnc),
  ));

  const status: Array<{ page: string; pageId: string; ok: boolean; error?: string }> = [];
  for (const page of pages) {
    try {
      const token = await storedPageToken(page.facebookPageId);
      if (!token) {
        status.push({ page: page.name, pageId: page.facebookPageId, ok: false, error: "PAGE_TOKEN_MISSING" });
        continue;
      }
      await graph(`/${encodeURIComponent(page.facebookPageId)}/subscribed_apps`, {
        method: "POST",
        body: new URLSearchParams({ subscribed_fields: "feed", access_token: token }),
      });
      status.push({ page: page.name, pageId: page.facebookPageId, ok: true });
    } catch (error) {
      status.push({ page: page.name, pageId: page.facebookPageId, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  await audit("processed", { setup: true, callbackUrl, pages: status.map(({ page, pageId, ok, error }) => ({ page, pageId, ok, error })) });
  return { callbackUrl, appSubscription: true, pages: status };
}

export async function metaWebhookHealth() {
  const db = getDb();
  const [last] = await db.select({
    action: activityLogs.action,
    createdAt: activityLogs.createdAt,
    metadata: activityLogs.metadata,
  }).from(activityLogs).where(eq(activityLogs.entityType, "meta_webhook")).orderBy(desc(activityLogs.createdAt)).limit(1);
  return {
    configured: metaWebhookConfigured(),
    callbackUrl: metaWebhookConfigured() ? metaWebhookCallbackUrl() : null,
    lastEventAt: last?.createdAt ?? null,
    lastAction: last?.action ?? null,
    lastMetadata: last?.metadata ?? null,
  };
}


export async function checkMetaWebhookSubscriptions() {
  if (!metaWebhookConfigured()) return { healthy: false, configured: false, app: false, pages: [] as Array<{ page: string; pageId: string; ok: boolean; error?: string }> };
  const appId = process.env.META_APP_ID!.trim();
  const appSecret = process.env.META_APP_SECRET!.trim();
  const appAccessToken = `${appId}|${appSecret}`;
  const callbackUrl = metaWebhookCallbackUrl();

  let app = false;
  try {
    const result = await graph(`/${appId}/subscriptions?access_token=${encodeURIComponent(appAccessToken)}`);
    const subscriptions = Array.isArray(result.data) ? result.data as Array<{ object?: string; callback_url?: string; active?: boolean; fields?: Array<string | { name?: string }> }> : [];
    app = subscriptions.some((item) =>
      item.object === "page" &&
      item.callback_url === callbackUrl &&
      item.active !== false &&
      (item.fields ?? []).some((field) => typeof field === "string" ? field === "feed" : field.name === "feed")
    );
  } catch {
    app = false;
  }

  const pages = await getDb().select({
    name: facebookPages.name,
    facebookPageId: facebookPages.facebookPageId,
  }).from(facebookPages).where(and(
    eq(facebookPages.platform, "facebook"),
    eq(facebookPages.isActive, true),
    isNotNull(facebookPages.accessTokenEnc),
  ));

  const pageStatus: Array<{ page: string; pageId: string; ok: boolean; error?: string }> = [];
  for (const page of pages) {
    try {
      const token = await storedPageToken(page.facebookPageId);
      if (!token) {
        pageStatus.push({ page: page.name, pageId: page.facebookPageId, ok: false, error: "PAGE_TOKEN_MISSING" });
        continue;
      }
      const result = await graph(`/${encodeURIComponent(page.facebookPageId)}/subscribed_apps?access_token=${encodeURIComponent(token)}`);
      const apps = Array.isArray(result.data) ? result.data as Array<{ id?: string; subscribed_fields?: string[] }> : [];
      const subscribed = apps.some((item) => item.id === appId && (!item.subscribed_fields || item.subscribed_fields.includes("feed")));
      pageStatus.push({ page: page.name, pageId: page.facebookPageId, ok: subscribed });
    } catch (error) {
      pageStatus.push({ page: page.name, pageId: page.facebookPageId, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const healthy = app && pageStatus.length > 0 && pageStatus.every((page) => page.ok);
  await audit(healthy ? "processed" : "failed", {
    healthCheck: true,
    app,
    callbackUrl,
    pages: pageStatus.map(({ page, pageId, ok, error }) => ({ page, pageId, ok, error })),
  });
  return { healthy, configured: true, app, pages: pageStatus };
}
