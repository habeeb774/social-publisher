import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { claimWebhookDeliveryQuery, finishWebhookDeliveryQuery, persistWebhookDeliveryQuery, recoverWebhookClaimsQuery } from "../src/services/meta-webhook-delivery-queries";

const dialect = new PgDialect();
test("durable webhook storage binds payloads and deduplicates delivery identity", () => {
  const payload = { object: "page", message: "');drop table users;--" };
  const query = dialect.sqlToQuery(persistWebhookDeliveryQuery("a".repeat(64), payload));
  assert.match(query.sql, /on conflict\(digest\) do nothing/);
  assert.ok(query.params.includes(JSON.stringify(payload)));
  assert.equal(query.sql.includes(payload.message), false);
});
test("webhook claim is atomic, ordered and skips other workers' locks", () => {
  const query = dialect.sqlToQuery(claimWebhookDeliveryQuery("claim"));
  assert.match(query.sql, /for update skip locked/);
  assert.match(query.sql, /order by created_at,id limit 1/);
  assert.match(query.sql, /and status='pending'/);
  assert.deepEqual(query.params, ["claim"]);
});
test("completion is fenced and interrupted processing goes to review, not blind replay", () => {
  for (const success of [true, false]) {
    const query = dialect.sqlToQuery(finishWebhookDeliveryQuery("id", "token", success));
    assert.match(query.sql, /claim_token=\$\d+::uuid and status='processing'/);
    assert.ok(query.params.includes(success ? "completed" : "needs_review"));
  }
  const recovery = dialect.sqlToQuery(recoverWebhookClaimsQuery());
  assert.match(recovery.sql, /status='needs_review'/);
  assert.doesNotMatch(recovery.sql, /status='pending'/);
});
