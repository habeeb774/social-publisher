import assert from "node:assert/strict";
import test from "node:test";
import { nextFreeSlots } from "../src/services/queue-slots";
import { classifyError } from "../src/services/error-classes";
import { normalizeTags } from "../src/services/catalog";
import { mapRows, parseDate, parseTime, suggestMapping } from "../src/services/import";

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
  assert.equal(classifyError("MCP_PUBLISH_OUTCOME_UNKNOWN: (MCP_POST_ID_MISSING: Facebook write action failed (#200) requires pages_manage_posts)").key, "authorization", "explicit rejection is not uncertain");
});

test("tags are normalized and de-duplicated", () => {
  assert.deepEqual(normalizeTags(["#عروض", "عروض", " أكتوبر ", ""]), ["عروض", "أكتوبر"]);
});

test("import suggests a column mapping from Arabic and English headers", () => {
  const m = suggestMapping(["رقم المنشور", "تاريخ النشر", "نص المنشور", "رابط الصورة", "جاهز للنشر", "ملاحظات"]);
  assert.equal(m.content, "نص المنشور"); assert.equal(m.date, "تاريخ النشر"); assert.equal(m.imageUrl, "رابط الصورة"); assert.equal(m.ready, "جاهز للنشر");
  assert.equal(suggestMapping(["Post Text", "Publish Date"]).date, "Publish Date");
});

test("import parses Saudi day-first dates and 12h Arabic times", () => {
  assert.equal(parseDate("2026-10-05"), "2026-10-05");
  assert.equal(parseDate("5/10/2026"), "2026-10-05");
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseTime("8:30 م"), "20:30");
  assert.equal(parseTime("12:00 ص"), "00:00");
  assert.equal(parseTime("25:00"), null);
});

test("import row mapping validates, converts Drive links and flags duplicates", () => {
  const rows = [
    { t: "منشور أ", d: "2099-01-01", i: "https://drive.google.com/file/d/ABC123/view?usp=drivesdk", r: "نعم" },
    { t: "", d: "2099-01-02", i: "", r: "نعم" },
    { t: "منشور أ", d: "2099-01-01", i: "", r: "نعم" },
    { t: "منشور ب", d: "bad", i: "http://insecure", r: "لا" },
  ];
  const out = mapRows(rows, { content: "t", date: "d", imageUrl: "i", ready: "r" }, "20:00");
  assert.equal(out[0].errors.length, 0);
  assert.equal(out[0].imageUrl, "https://drive.google.com/uc?export=download&id=ABC123");
  assert.equal(out[0].scheduledAt!.toISOString(), "2099-01-01T17:00:00.000Z", "20:00 Riyadh");
  assert.ok(out[1].errors.includes("النص فارغ"));
  assert.ok(out[2].errors.includes("صف مكرر"));
  assert.ok(out[3].errors.some((e) => e.includes("تاريخ")) && out[3].errors.some((e) => e.includes("https")));
  assert.equal(out[3].ready, false);
});

// ---------- Database behaviour (runs against a disposable Neon branch when TEST_DATABASE_URL is set) ----------
const dbUrl = process.env.TEST_DATABASE_URL;
test("database workflows", { skip: !dbUrl && "TEST_DATABASE_URL not set" }, async (t) => {
  const { assertDisposableDatabase } = await import("./database-safety");
  assertDisposableDatabase(dbUrl,process.env.DISPOSABLE_TEST_DATABASE_HOST,process.env.DATABASE_URL);
  process.env.DATABASE_URL = dbUrl;
  delete process.env.RESEND_API_KEY;
  process.env.WINDSOR_API_KEY ||= "test-only"; // satisfies the "publishing connection configured" check; no network call is made
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

  await t.test("changing page invalidates approval and scheduling but does not move published history", async () => {
    const [destination] = await db.insert(schema.facebookPages).values({ name: "QA page change", facebookPageId: `qa-page-change-${crypto.randomUUID()}` }).returning();
    for (const status of ["scheduled", "approved", "pending_approval", "failed"] as const) {
      const source = await make({ status, scheduledAt: new Date(Date.now() + 7200000), inQueue: true, queueOrder: 2, lastError: "old error", failedAt: new Date() });
      assert.deepEqual((await ops.bulkAction([source.id], "change_page", destination.id)).changed, [source.id]);
      const [moved] = await db.select().from(schema.posts).where(eq(schema.posts.id, source.id));
      assert.equal(moved.pageId, destination.id);
      assert.equal(moved.status, "draft");
      assert.equal(moved.scheduledAt, null);
      assert.equal(moved.inQueue, false);
      assert.equal(moved.queueOrder, null);
      assert.equal(moved.lastError, null);
      assert.equal(moved.failedAt, null);
    }
    const historical = await make({ status: "failed", facebookPostId: "qa-already-published" });
    assert.deepEqual((await ops.bulkAction([historical.id], "change_page", destination.id)).changed, []);
    assert.equal((await db.select().from(schema.posts).where(eq(schema.posts.id, historical.id)))[0].pageId, page.id);
    const unchanged = await make({ status: "approved" });
    assert.deepEqual((await ops.bulkAction([unchanged.id], "change_page", page.id)).changed, []);
    assert.equal((await db.select().from(schema.posts).where(eq(schema.posts.id, unchanged.id)))[0].status, "approved");
  });

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
    await db.insert(schema.postMedia).values({postId:post.id,type:"image",url:"https://example.test/old.png"});
    await ops.snapshotPost(post, "edit");
    await db.update(schema.posts).set({ content: "النسخة الثانية",status:"approved",inQueue:true }).where(eq(schema.posts.id, post.id));
    await db.delete(schema.postMedia).where(eq(schema.postMedia.postId,post.id));
    await db.insert(schema.postMedia).values({postId:post.id,type:"image",url:"https://example.test/new.png"});
    const [version] = await db.select().from(schema.postVersions).where(eq(schema.postVersions.postId, post.id));
    const restored = await ops.restoreVersion(post.id, version.id);
    assert.equal(restored.content, "النسخة الأولى");
    assert.equal(restored.status,"draft");
    assert.equal(restored.inQueue,false);
    assert.equal((await db.select().from(schema.postMedia).where(eq(schema.postMedia.postId,post.id)))[0].url,"https://example.test/old.png");
    assert.equal((await db.select().from(schema.postVersions).where(eq(schema.postVersions.postId, post.id))).length, 2, "current state saved before restore");
    const beforeImage=(await db.select().from(schema.postVersions).where(eq(schema.postVersions.postId,post.id))).find(row=>row.reason==="before_restore");
    assert.equal(beforeImage?.content,"النسخة الثانية");
    assert.equal((beforeImage?.mediaSnapshot as Array<{url:string}>)[0].url,"https://example.test/new.png");
    await db.update(schema.postVersions).set({mediaSnapshot:[{url:null,type:"image"}]}).where(eq(schema.postVersions.id,version.id));
    await assert.rejects(ops.restoreVersion(post.id,version.id));
    assert.equal((await db.select().from(schema.posts).where(eq(schema.posts.id,post.id)))[0].content,"النسخة الأولى");
    assert.equal((await db.select().from(schema.postVersions).where(eq(schema.postVersions.postId,post.id))).length,2,"invalid snapshot does not save a partial revision");
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

  await t.test("pre-publish checklist blocks critical problems and warns on conflicts", async () => {
    const { prePublishChecks } = await import("../src/services/prepublish");
    const past = await prePublishChecks({ pageId: page.id, content: "", scheduledAt: new Date(Date.now() - 1000) });
    assert.equal(past.blocking, true);
    assert.ok(past.items.find((i) => i.key === "content" && !i.ok) && past.items.find((i) => i.key === "time" && !i.ok));
    const at = new Date(Date.now() + 5 * 86400000);
    await make({ status: "scheduled", scheduledAt: at }); await make({ status: "scheduled", scheduledAt: new Date(at.getTime() + 60000) });
    const ok = await prePublishChecks({ pageId: page.id, content: "نص", scheduledAt: at });
    assert.equal(ok.blocking, false, "conflicts are warnings, not blocks");
    assert.equal(ok.items.find((i) => i.key === "conflict")!.ok, false);
  });

  await t.test("trash: deleted drafts restore and purge; posts with history are never purged", async () => {
    const trash = await import("../src/services/trash");
    const draft = await make({ deletedAt: new Date() });
    assert.equal((await trash.restoreFromTrash(draft.id)).deletedAt, null);
    await db.update(schema.posts).set({ deletedAt: new Date() }).where(eq(schema.posts.id, draft.id));
    assert.equal(await trash.purgePosts([draft.id]), 1);
    created.splice(created.indexOf(draft.id), 1);
    const withHistory = await make({ deletedAt: new Date() });
    await db.insert(schema.publicationAttempts).values({ postId: withHistory.id, attemptNumber: 1, status: "failed" });
    assert.equal(await trash.purgePosts([withHistory.id]), 0);
  });

  // Clean up everything this test created (disposable branch, but keep it tidy).
  const { inArray } = await import("drizzle-orm");
  await db.delete(schema.postMedia).where(inArray(schema.postMedia.postId, created));
  await db.delete(schema.publicationAttempts).where(inArray(schema.publicationAttempts.postId, created));
  await db.delete(schema.postVersions).where(inArray(schema.postVersions.postId, created));
  await db.delete(schema.postNotes).where(inArray(schema.postNotes.postId, created));
  await db.delete(schema.posts).where(inArray(schema.posts.id, created));
});
