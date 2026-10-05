import assert from "node:assert/strict";
import test from "node:test";
import { nextFreeSlots } from "../src/services/queue-slots";
import { classifyError } from "../src/services/error-classes";
import { normalizeTags } from "../src/services/catalog";

// ---------- Pure logic (always runs) ----------
// 2026-10-05 is a Monday. Riyadh = UTC+3.
const mondayNoonRiyadh = new Date("2026-10-05T12:00:00+03:00");

test("queue picks the first free slot after now, in Riyadh time", () => {
  const slots = [{ weekday: 1, time: "10:00" }, { weekday: 1, time: "20:00" }, { weekday: 2, time: "10:00" }];
  const [first, second] = nextFreeSlots(slots, mondayNoonRiyadh, 2);
  assert.equal(first.toISOString(), new Date("2026-10-05T20:00:00+03:00").toISOString(), "today 8pm, since 10am passed");
  assert.equal(second.toISOString(), new Date("2026-10-06T10:00:00+03:00").toISOString(), "then tomorrow 10am");
});

test("queue skips slots already taken by manually scheduled posts", () => {
  const slots = [{ weekday: 1, time: "20:00" }, { weekday: 2, time: "10:00" }];
  const taken = [new Date("2026-10-05T20:00:00+03:00").getTime()];
  const [first] = nextFreeSlots(slots, mondayNoonRiyadh, 1, taken);
  assert.equal(first.toISOString(), new Date("2026-10-06T10:00:00+03:00").toISOString());
});

test("queue wraps to next week and never returns duplicates", () => {
  const times = nextFreeSlots([{ weekday: 6, time: "09:30" }], mondayNoonRiyadh, 3);
  assert.deepEqual(times.map((t) => t.toISOString()), ["2026-10-10T06:30:00.000Z", "2026-10-17T06:30:00.000Z", "2026-10-24T06:30:00.000Z"]);
});

test("queue ignores invalid slots and returns nothing without slots", () => {
  assert.equal(nextFreeSlots([{ weekday: 9, time: "25:00" }], mondayNoonRiyadh, 2).length, 0);
  assert.equal(nextFreeSlots([], mondayNoonRiyadh, 2).length, 0);
});

test("error classification only allows retry for transient failures", () => {
  assert.equal(classifyError("FACEBOOK_GRAPH_ERROR: (#200) permission denied").retryable, false);
  assert.equal(classifyError("MCP_PUBLISH_OUTCOME_UNKNOWN: verify page").key, "uncertain");
  assert.equal(classifyError("MCP_PUBLISH_OUTCOME_UNKNOWN: verify page").retryable, false);
  assert.equal(classifyError("network timeout").retryable, true);
  assert.equal(classifyError("FACEBOOK_GRAPH_ERROR: (#324) image url invalid").key, "image");
});

test("tags are normalized and de-duplicated", () => {
  assert.deepEqual(normalizeTags(["#عروض", "عروض", " أكتوبر ", ""]), ["عروض", "أكتوبر"]);
});

// ---------- Database behaviour (runs against a disposable Neon branch when TEST_DATABASE_URL is set) ----------
const dbUrl = process.env.TEST_DATABASE_URL;
test("database workflows", { skip: !dbUrl && "TEST_DATABASE_URL not set" }, async (t) => {
  process.env.DATABASE_URL = dbUrl;
  delete process.env.RESEND_API_KEY;
  const { getDb } = await import("../src/db");
  const schema = await import("../src/db/schema");
  const ops = await import("../src/services/post-ops");
  const { eq } = await import("drizzle-orm");
  const db = getDb();
  const [page] = await db.select().from(schema.facebookPages).limit(1);
  const created: string[] = [];
  const make = async (values: Partial<typeof schema.posts.$inferInsert> = {}) => {
    const [row] = await db.insert(schema.posts).values({ pageId: page.id, content: "اختبار آلي", status: "draft", ...values }).returning();
    created.push(row.id); return row;
  };

  await t.test("duplicate copies text, image and page but not Facebook IDs or attempts", async () => {
    const src = await make({ status: "published", facebookPostId: "fb_1", facebookPermalink: "https://facebook.com/x", publishedAt: new Date(), tags: ["a"] });
    await db.insert(schema.postMedia).values({ postId: src.id, type: "image", url: "https://example.com/a.png" });
    await db.insert(schema.publicationAttempts).values({ postId: src.id, attemptNumber: 1, status: "success" });
    const copy = await ops.duplicatePost(src.id); created.push(copy.id);
    assert.equal(copy.status, "draft"); assert.equal(copy.content, src.content); assert.equal(copy.pageId, src.pageId);
    assert.equal(copy.facebookPostId, null); assert.equal(copy.publishedAt, null); assert.deepEqual(copy.tags, ["a"]);
    assert.equal((await db.select().from(schema.postMedia).where(eq(schema.postMedia.postId, copy.id))).length, 1);
    assert.equal((await db.select().from(schema.publicationAttempts).where(eq(schema.publicationAttempts.postId, copy.id))).length, 0);
  });

  await t.test("revision restore brings back old content and refuses published posts", async () => {
    const post = await make({ content: "النسخة الأولى" });
    await ops.snapshotPost(post, "edit");
    await db.update(schema.posts).set({ content: "النسخة الثانية" }).where(eq(schema.posts.id, post.id));
    const [version] = await db.select().from(schema.postVersions).where(eq(schema.postVersions.postId, post.id));
    const restored = await ops.restoreVersion(post.id, version.id);
    assert.equal(restored.content, "النسخة الأولى");
    assert.equal((await db.select().from(schema.postVersions).where(eq(schema.postVersions.postId, post.id))).length, 2, "current state saved before restore");
    const pub = await make({ status: "published" });
    await ops.snapshotPost(pub, "edit");
    const [pv] = await db.select().from(schema.postVersions).where(eq(schema.postVersions.postId, pub.id));
    await assert.rejects(ops.restoreVersion(pub.id, pv.id), /NOT_EDITABLE/);
  });

  await t.test("approval: submit → approve schedules future posts; reject returns to draft with a note", async () => {
    const future = await make({ scheduledAt: new Date(Date.now() + 86400000) });
    await ops.submitForApproval(future.id);
    assert.equal((await ops.approvePost(future.id)).status, "scheduled");
    const past = await make({ scheduledAt: new Date(Date.now() - 1000) });
    await ops.submitForApproval(past.id);
    assert.equal((await ops.approvePost(past.id)).status, "approved", "past time is not auto-published");
    const rejected = await make();
    await ops.submitForApproval(rejected.id);
    assert.equal((await ops.rejectPost(rejected.id, "راجع النص")).status, "draft");
    assert.equal((await db.select().from(schema.postNotes).where(eq(schema.postNotes.postId, rejected.id)))[0].body, "رُفض: راجع النص");
    await assert.rejects(ops.approvePost(rejected.id), /NOT_PENDING/);
  });

  await t.test("bulk actions respect status rules", async () => {
    const draft = await make({ scheduledAt: new Date(Date.now() + 7200000) });
    const published = await make({ status: "published" });
    const res = await ops.bulkAction([draft.id, published.id], "schedule");
    assert.deepEqual(res.changed, [draft.id]); assert.equal(res.skipped.length, 1);
    const un = await ops.bulkAction([draft.id], "unschedule");
    assert.deepEqual(un.changed, [draft.id]);
    const [after] = await db.select().from(schema.posts).where(eq(schema.posts.id, draft.id));
    assert.equal(after.status, "draft"); assert.equal(after.scheduledAt, null);
    const del = await ops.bulkAction([draft.id, published.id], "delete_drafts");
    assert.deepEqual(del.changed, [draft.id], "only drafts can be deleted");
  });

  await t.test("campaign assignment links posts and can be cleared", async () => {
    const [campaign] = await db.insert(schema.campaigns).values({ name: "اختبار حملة" }).returning();
    const post = await make();
    await ops.bulkAction([post.id], "assign_campaign", campaign.id);
    assert.equal((await db.select().from(schema.posts).where(eq(schema.posts.id, post.id)))[0].campaignId, campaign.id);
    await ops.bulkAction([post.id], "assign_campaign", null);
    assert.equal((await db.select().from(schema.posts).where(eq(schema.posts.id, post.id)))[0].campaignId, null);
    await db.delete(schema.campaigns).where(eq(schema.campaigns.id, campaign.id));
  });

  await t.test("queue reorder recalculates publish times", async () => {
    const before = await db.select().from(schema.queueSlots);
    await db.delete(schema.queueSlots);
    await db.insert(schema.queueSlots).values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, time: "03:17" })));
    const a = await make(); const b = await make();
    await ops.addToQueue(a.id); await ops.addToQueue(b.id);
    const get = async (id: string) => (await db.select().from(schema.posts).where(eq(schema.posts.id, id)))[0];
    const [ta, tb] = [(await get(a.id)).scheduledAt!, (await get(b.id)).scheduledAt!];
    assert.ok(ta < tb, "first added gets the earlier slot");
    await ops.recomputeQueue([b.id, a.id]);
    assert.equal((await get(b.id)).scheduledAt!.getTime(), ta.getTime(), "moved post takes the first slot");
    assert.equal((await get(a.id)).scheduledAt!.getTime(), tb.getTime());
    await db.update(schema.posts).set({ inQueue: false, status: "draft" }).where(eq(schema.posts.inQueue, true));
    await db.delete(schema.queueSlots);
    if (before.length) await db.insert(schema.queueSlots).values(before.map(({ weekday, time }) => ({ weekday, time })));
  });

  await t.test("retry center: classification decides retryability", async () => {
    const transient = await make({ status: "failed", lastError: "network timeout" });
    const auth = await make({ status: "failed", lastError: "FACEBOOK_GRAPH_ERROR: (#200) permission" });
    const { classifyError: classify } = await import("../src/services/error-classes");
    assert.equal(classify(transient.lastError).retryable, true);
    assert.equal(classify(auth.lastError).retryable, false);
  });

  // Clean up everything this test created (disposable branch, but keep it tidy).
  const { inArray } = await import("drizzle-orm");
  await db.delete(schema.postMedia).where(inArray(schema.postMedia.postId, created));
  await db.delete(schema.publicationAttempts).where(inArray(schema.publicationAttempts.postId, created));
  await db.delete(schema.postVersions).where(inArray(schema.postVersions.postId, created));
  await db.delete(schema.postNotes).where(inArray(schema.postNotes.postId, created));
  await db.delete(schema.posts).where(inArray(schema.posts.id, created));
});
