import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { postMedia, postRecurrences, posts } from "@/db/schema";
import { logAudit } from "./audit";
import { approvalRequired } from "./post-ops";

export type Frequency = "weekly" | "monthly";
export const MATERIALIZE_AHEAD_HOURS = 48;

/** Next occurrence keeping the Riyadh wall-clock time. Monthly clamps to the month's last day (31 → 30/28). */
export function nextOccurrence(from: Date, frequency: Frequency, interval: number, anchorDay?: number) {
  if (frequency === "weekly") return new Date(from.getTime() + interval * 7 * 86400000);
  const local = new Date(from.getTime() + 3 * 3600000);
  const day = anchorDay ?? local.getUTCDate();
  const target = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + interval, 1, local.getUTCHours(), local.getUTCMinutes()));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return new Date(target.getTime() - 3 * 3600000);
}

/**
 * Creates a separate scheduled post for every occurrence due within the next 48 hours.
 * Each instance is its own record (own attempts and audit). The rule row is advanced with a
 * compare-and-set on next_run_at, so overlapping worker runs can never create the same instance twice.
 */
export async function materializeRecurrences(now = new Date()) {
  const db = getDb();
  const due = await db.select().from(postRecurrences).where(and(eq(postRecurrences.active, true), lte(postRecurrences.nextRunAt, new Date(now.getTime() + MATERIALIZE_AHEAD_HOURS * 3600000)))).limit(50);
  const created: string[] = [];
  for (const rule of due) {
    const runAt = rule.nextRunAt;
    const ended = (rule.endsAt && runAt > rule.endsAt) || (rule.maxOccurrences !== null && rule.occurrences >= rule.maxOccurrences);
    if (ended) { await db.update(postRecurrences).set({ active: false, updatedAt: new Date() }).where(eq(postRecurrences.id, rule.id)); continue; }
    const anchorDay = new Date(runAt.getTime() + 3 * 3600000).getUTCDate();
    const next = nextOccurrence(runAt, rule.frequency as Frequency, rule.interval, rule.frequency === "monthly" ? anchorDay : undefined);
    const [claimed] = await db.update(postRecurrences).set({ nextRunAt: next, occurrences: rule.occurrences + 1, updatedAt: new Date() }).where(and(eq(postRecurrences.id, rule.id), eq(postRecurrences.nextRunAt, runAt))).returning();
    if (!claimed) continue; // another run already handled this occurrence
    if (runAt.getTime() <= now.getTime() + 60000) continue; // missed occurrence: skip rather than publish late
    const [source] = await db.select().from(posts).where(eq(posts.id, rule.sourcePostId)).limit(1);
    if (!source || source.deletedAt) { await db.update(postRecurrences).set({ active: false }).where(eq(postRecurrences.id, rule.id)); continue; }
    const [instance] = await db.insert(posts).values({ pageId: source.pageId, content: source.content, scheduledAt: runAt, status: await approvalRequired() ? "pending_approval" : "scheduled", timezone: source.timezone, category: source.category, tags: source.tags, campaignId: source.campaignId, recurrenceId: rule.id }).returning({ id: posts.id });
    const media = await db.select().from(postMedia).where(eq(postMedia.postId, source.id));
    if (media.length) await db.insert(postMedia).values(media.map((m) => ({ postId: instance.id, type: m.type, url: m.url, mimeType: m.mimeType })));
    created.push(instance.id);
  }
  if (created.length) await logAudit("recurrence.materialized", "post", null, { created });
  return created;
}
