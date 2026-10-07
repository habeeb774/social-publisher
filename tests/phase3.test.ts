import assert from "node:assert/strict";
import test from "node:test";
import { getAiProvider } from "../src/services/ai-assistant";
import { libraryItemSchema } from "../src/services/library";
import { auditLabel } from "../src/services/audit-labels";

test("AI assistant is disabled unless a key is configured, and the system does not depend on it", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try { assert.equal(getAiProvider(), null); process.env.ANTHROPIC_API_KEY = "test"; assert.ok(getAiProvider()); }
  finally { if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved; }
});

test("library items validate kinds, titles and https media", () => {
  assert.equal(libraryItemSchema.safeParse({ kind: "idea", title: "فكرة" }).success, true);
  assert.equal(libraryItemSchema.safeParse({ kind: "unknown", title: "x" }).success, false);
  assert.equal(libraryItemSchema.safeParse({ kind: "image", title: "x", mediaUrl: "http://x.test/a.png" }).success, false);
});

test("audit labels are human readable with a safe fallback", () => {
  assert.equal(auditLabel("post.approved"), "موافقة");
  assert.equal(auditLabel("something.new"), "something.new");
});

const dbUrl = process.env.TEST_DATABASE_URL;
test("phase 3 database workflows", { skip: !dbUrl && "TEST_DATABASE_URL not set" }, async (t) => {
  const { assertDisposableDatabase } = await import("./database-safety");
  assertDisposableDatabase(dbUrl,process.env.DISPOSABLE_TEST_DATABASE_HOST,process.env.DATABASE_URL);
  process.env.DATABASE_URL = dbUrl;
  const { getDb } = await import("../src/db");
  const schema = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { convertToDraft } = await import("../src/services/library");
  const { setupProgress } = await import("../src/services/setup");
  const db = getDb();

  await t.test("converting an idea creates a draft (never scheduled) and marks the idea converted", async () => {
    const [idea] = await db.insert(schema.libraryItems).values({ kind: "idea", title: "فكرة اختبار", body: "التفاصيل", mediaUrl: "https://example.com/i.png", tags: ["تجربة"] }).returning();
    const post = await convertToDraft(idea.id);
    assert.equal(post.status, "draft"); assert.equal(post.scheduledAt, null); assert.ok(post.content.includes("فكرة اختبار") && post.content.includes("التفاصيل"));
    const [after] = await db.select().from(schema.libraryItems).where(eq(schema.libraryItems.id, idea.id));
    assert.equal(after.status, "converted"); assert.equal(after.convertedPostId, post.id);
    assert.equal((await db.select().from(schema.postMedia).where(eq(schema.postMedia.postId, post.id))).length, 1);
    await db.delete(schema.libraryItems).where(eq(schema.libraryItems.id, idea.id));
    await db.delete(schema.postMedia).where(eq(schema.postMedia.postId, post.id));
    await db.delete(schema.posts).where(eq(schema.posts.id, post.id));
  });

  await t.test("setup progress reflects real state", async () => {
    const s = await setupProgress();
    assert.equal(s.steps.find((x) => x.key === "first_post")!.done, true, "test branch has posts");
    assert.ok(s.percent > 0 && s.percent <= 100);
  });
});
