import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RULES, nextAllowed, violation, type PublishingRules } from "../src/services/publishing-rules";
import { nextOccurrence } from "../src/services/recurrence";
import { toCsv } from "../src/services/export";
import { nextFreeSlots } from "../src/services/queue-slots";

const rules = (r: Partial<PublishingRules>): PublishingRules => ({ ...DEFAULT_RULES, ...r, window: { ...DEFAULT_RULES.window, ...r.window } });
const at = (s: string) => new Date(`${s}+03:00`);

test("publishing window blocks 00:00–07:00 Riyadh and shifts to 07:00", () => {
  const r = rules({ window: { enabled: true, start: "00:00", end: "07:00", mode: "shift" } });
  assert.ok(violation(at("2026-10-06T03:00:00"), r));
  assert.equal(violation(at("2026-10-06T07:00:00"), r), null);
  assert.equal(nextAllowed(at("2026-10-06T03:00:00"), r)!.toISOString(), at("2026-10-06T07:00:00").toISOString());
});

test("window that wraps midnight (22:00–06:00)", () => {
  const r = rules({ window: { enabled: true, start: "22:00", end: "06:00", mode: "warn" } });
  assert.ok(violation(at("2026-10-06T23:30:00"), r));
  assert.ok(violation(at("2026-10-07T05:59:00"), r));
  assert.equal(violation(at("2026-10-06T21:59:00"), r), null);
  assert.equal(nextAllowed(at("2026-10-06T23:30:00"), r)!.toISOString(), at("2026-10-07T06:00:00").toISOString());
});

test("quiet Friday and quiet dates move to the next allowed day", () => {
  const r = rules({ quietWeekdays: [5], quietDates: ["2026-10-10"] });
  assert.ok(violation(at("2026-10-09T20:00:00"), r), "2026-10-09 is a Friday");
  assert.equal(nextAllowed(at("2026-10-09T20:00:00"), r)!.toISOString(), at("2026-10-11T00:00:00").toISOString(), "skips Friday and the quiet Saturday");
});

test("disabled rules allow everything", () => {
  assert.equal(violation(at("2026-10-09T03:00:00"), DEFAULT_RULES), null);
});

test("queue skips slots blocked by rules", () => {
  const r = rules({ quietWeekdays: [5] });
  const slots = [{ weekday: 4, time: "20:00" }, { weekday: 5, time: "20:00" }, { weekday: 6, time: "20:00" }];
  const out = nextFreeSlots(slots, at("2026-10-08T21:00:00"), 2, [], 30, (d) => !violation(d, r));
  assert.deepEqual(out.map((d) => d.toISOString()), [at("2026-10-10T20:00:00").toISOString(), at("2026-10-15T20:00:00").toISOString()]);
});

test("recurrence: weekly keeps time, monthly clamps to month end", () => {
  assert.equal(nextOccurrence(at("2026-10-05T20:00:00"), "weekly", 1).toISOString(), at("2026-10-12T20:00:00").toISOString());
  assert.equal(nextOccurrence(at("2026-10-05T20:00:00"), "weekly", 2).toISOString(), at("2026-10-19T20:00:00").toISOString());
  assert.equal(nextOccurrence(at("2026-01-31T20:00:00"), "monthly", 1, 31).toISOString(), at("2026-02-28T20:00:00").toISOString());
  assert.equal(nextOccurrence(at("2026-02-28T20:00:00"), "monthly", 1, 31).toISOString(), at("2026-03-31T20:00:00").toISOString(), "anchor day restores after a short month");
});

test("CSV escapes quotes/newlines, adds BOM and neutralizes formulas", () => {
  const csv = toCsv([{ a: 'قال "مرحبا"', b: "سطر\nثان", c: "=HYPERLINK(1)" }], [["a", "A"], ["b", "B"], ["c", "C"]]);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes('"قال ""مرحبا"""'));
  assert.ok(csv.includes('"سطر\nثان"'));
  assert.ok(csv.includes("'=HYPERLINK(1)"));
});

const dbUrl = process.env.TEST_DATABASE_URL;
test("phase 2 database workflows", { skip: !dbUrl && "TEST_DATABASE_URL not set" }, async (t) => {
  process.env.DATABASE_URL = dbUrl;
  delete process.env.RESEND_API_KEY;
  const { getDb } = await import("../src/db");
  const schema = await import("../src/db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const { materializeRecurrences } = await import("../src/services/recurrence");
  const { goalsWithProgress } = await import("../src/services/goals");
  const db = getDb();
  const [page] = await db.select().from(schema.facebookPages).limit(1);
  const created: string[] = [];

  await t.test("recurrence creates one independent instance per occurrence, never duplicates, and stops at the limit", async () => {
    const [source] = await db.insert(schema.posts).values({ pageId: page.id, content: "متكرر", status: "draft" }).returning(); created.push(source.id);
    const first = new Date(Date.now() + 3600000);
    const [rule] = await db.insert(schema.postRecurrences).values({ sourcePostId: source.id, frequency: "weekly", interval: 1, nextRunAt: first, maxOccurrences: 2 }).returning();
    const a = await materializeRecurrences();
    const b = await materializeRecurrences();
    assert.equal(a.length, 1, "first occurrence within 48h is created"); assert.equal(b.length, 0, "second run does not duplicate");
    created.push(...a);
    const [instance] = await db.select().from(schema.posts).where(eq(schema.posts.id, a[0]));
    assert.equal(instance.status, "scheduled"); assert.equal(instance.recurrenceId, rule.id); assert.equal(instance.scheduledAt!.getTime(), first.getTime());
    // Pull the second occurrence into the window, then the rule must stop after it.
    await db.update(schema.postRecurrences).set({ nextRunAt: new Date(Date.now() + 7200000) }).where(eq(schema.postRecurrences.id, rule.id));
    const c = await materializeRecurrences(); created.push(...c);
    assert.equal(c.length, 1);
    await db.update(schema.postRecurrences).set({ nextRunAt: new Date(Date.now() + 10800000) }).where(eq(schema.postRecurrences.id, rule.id));
    assert.equal((await materializeRecurrences()).length, 0);
    assert.equal((await db.select().from(schema.postRecurrences).where(eq(schema.postRecurrences.id, rule.id)))[0].active, false);
    await db.delete(schema.postRecurrences).where(eq(schema.postRecurrences.id, rule.id));
  });

  await t.test("goal progress counts published posts in the Riyadh month", async () => {
    const month = "2099-03";
    const [goal] = await db.insert(schema.contentGoals).values({ month, category: "أخبار", target: 4 }).returning();
    const [p1] = await db.insert(schema.posts).values({ pageId: page.id, content: "خبر", status: "published", category: "أخبار", publishedAt: new Date("2099-03-01T00:30:00+03:00") }).returning();
    const [p2] = await db.insert(schema.posts).values({ pageId: page.id, content: "خبر قديم", status: "published", category: "أخبار", publishedAt: new Date("2099-02-28T23:30:00+03:00") }).returning();
    created.push(p1.id, p2.id);
    const [g] = await goalsWithProgress(month);
    assert.equal(g.published, 1, "only posts inside the Riyadh month count"); assert.equal(g.percent, 25);
    await db.delete(schema.contentGoals).where(eq(schema.contentGoals.id, goal.id));
  });

  await db.delete(schema.postMedia).where(inArray(schema.postMedia.postId, created));
  await db.delete(schema.posts).where(inArray(schema.posts.id, created));
});
