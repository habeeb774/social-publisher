import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { assertDisposableDatabase } from "./database-safety";
import { claimWebhookDeliveryQuery, finishWebhookDeliveryQuery, persistWebhookDeliveryQuery, recoverWebhookClaimsQuery } from "../src/services/meta-webhook-delivery-queries";

test("durable webhook migration, deduplication, concurrent claims and completion fencing on isolated Postgres", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  assertDisposableDatabase(process.env.TEST_DATABASE_URL, process.env.DISPOSABLE_TEST_DATABASE_HOST, process.env.DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { getDb } = await import("../src/db");
  const db = getDb();
  const existing = (await db.execute(sql`select to_regclass('public.meta_webhook_deliveries') as relation`)).rows[0].relation;
  if (!existing) {
    const migration = await readFile(new URL("../drizzle/0018_meta_webhook_deliveries.sql", import.meta.url), "utf8");
    await db.batch(migration.replace(/^--.*$/gm, "").split(";").filter(statement => statement.trim()).map(statement => db.execute(sql.raw(statement))) as never);
  }
  // Test only designated synthetic payloads; no provider API or real messages.
  const digest = createHash("sha256").update(randomUUID()).digest("hex");
  await Promise.all([db.execute(persistWebhookDeliveryQuery(digest, { object: "qa" })), db.execute(persistWebhookDeliveryQuery(digest, { object: "qa" }))]);
  const stored = (await db.execute(sql`select id,status from meta_webhook_deliveries where digest=${digest}`)).rows;
  assert.equal(stored.length, 1); assert.equal(stored[0].status, "pending");
  const tokens = [randomUUID(), randomUUID()];
  const claimed = await Promise.all(tokens.map(token => db.execute(claimWebhookDeliveryQuery(token))));
  const claims = claimed.flatMap(result => result.rows);
  assert.equal(claims.length, 1, "only one worker owns the sole pending event");
  const claim = claims[0];
  assert.equal(claim.id, stored[0].id);
  assert.equal((await db.execute(finishWebhookDeliveryQuery(String(claim.id), randomUUID(), true))).rows.length, 0);
  assert.equal((await db.execute(finishWebhookDeliveryQuery(String(claim.id), String(claim.claim_token), true))).rows.length, 1);
  assert.equal((await db.execute(finishWebhookDeliveryQuery(String(claim.id), String(claim.claim_token), false))).rows.length, 0);
  await db.execute(persistWebhookDeliveryQuery(digest, { object: "qa" }));
  assert.equal((await db.execute(claimWebhookDeliveryQuery(randomUUID()))).rows.length, 0, "redelivery does not replay completed event");

  const interruptedDigest = createHash("sha256").update(randomUUID()).digest("hex");
  await db.execute(persistWebhookDeliveryQuery(interruptedDigest, { object: "qa" }));
  const interrupted = (await db.execute(claimWebhookDeliveryQuery(randomUUID()))).rows[0];
  await db.execute(sql`update meta_webhook_deliveries set claimed_at=now()-interval '6 minutes' where id=${interrupted.id}::uuid`);
  await db.execute(recoverWebhookClaimsQuery());
  assert.equal((await db.execute(finishWebhookDeliveryQuery(String(interrupted.id), String(interrupted.claim_token), true))).rows.length, 0);
  const recovered = (await db.execute(sql`select status,last_error_code,claim_token from meta_webhook_deliveries where id=${interrupted.id}::uuid`)).rows[0];
  assert.deepEqual(recovered, { status: "needs_review", last_error_code: "META_WEBHOOK_PROCESS_INTERRUPTED", claim_token: null });
  assert.equal((await db.execute(claimWebhookDeliveryQuery(randomUUID()))).rows.length, 0);
});
