import { randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { isPublishingEnabled } from "./publishing-mode";
import { getSetting, setSetting } from "./settings-store";

// A private, unguessable link that shows operational status only (no content, names of customers, or tokens).
export async function statusKey(rotate = false) {
  let key = await getSetting<string>("public_status_key", "");
  if (!key || rotate) { key = randomBytes(18).toString("base64url"); await setSetting("public_status_key", key); }
  return key;
}
export async function checkStatusKey(candidate: string) {
  const key = await getSetting<string>("public_status_key", "");
  if (!key || candidate.length !== key.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(key));
}

type Row = Record<string, unknown>;
export async function publicStatus() {
  const db = getDb();
  const one = async (q: ReturnType<typeof sql>) => ((await db.execute(q).catch(() => ({ rows: [] }))).rows[0] ?? {}) as Row;
  const [run, posts, comments, messenger, alerts] = await Promise.all([
    one(sql`select triggered_at, status from scheduler_runs order by triggered_at desc limit 1`),
    one(sql`select min(scheduled_at) filter (where status='scheduled' and deleted_at is null) as next_post,
      count(*) filter (where status='scheduled' and deleted_at is null)::int as scheduled,
      count(*) filter (where status='published' and published_at > now()-interval '24 hours')::int as published_24h,
      count(*) filter (where status='failed' and deleted_at is null and failed_at > now()-interval '24 hours')::int as failed_24h from posts`),
    one(sql`select max(started_at) as last_sync, (array_agg(status order by started_at desc))[1] as last_status from comments_sync_runs`),
    getSetting<{ checkedAt: string; pages: Record<string, string | null> } | null>("messenger_status", null),
    db.execute(sql`select title, created_at from notifications where type in ('publish_failed','token_invalid','token_expiring','scheduler_gap') and created_at > now()-interval '3 days' order by created_at desc limit 5`).then((r) => r.rows as Row[]).catch(() => [] as Row[]),
  ]);
  const lastRun = run.triggered_at ? new Date(String(run.triggered_at)) : null;
  const minutesSince = lastRun ? Math.round((Date.now() - lastRun.getTime()) / 60000) : null;
  return {
    publishingEnabled: isPublishingEnabled(),
    worker: { lastRun: lastRun?.toISOString() ?? null, minutesSince, healthy: minutesSince !== null && minutesSince <= 25 && run.status === "success" },
    posts: { nextPost: posts.next_post ? new Date(String(posts.next_post)).toISOString() : null, scheduled: Number(posts.scheduled ?? 0), published24h: Number(posts.published_24h ?? 0), failed24h: Number(posts.failed_24h ?? 0) },
    comments: { lastSync: comments.last_sync ? new Date(String(comments.last_sync)).toISOString() : null, ok: comments.last_status === "success" },
    messenger: messenger ? { checkedAt: messenger.checkedAt, ok: Object.values(messenger.pages).every((e) => !e) } : null,
    alerts: alerts.map((a) => ({ title: String(a.title), at: new Date(String(a.created_at)).toISOString() })),
    generatedAt: new Date().toISOString(),
  };
}
