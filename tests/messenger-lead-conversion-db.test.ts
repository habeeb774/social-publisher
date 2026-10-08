import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { assertDisposableDatabase } from "./database-safety";

test("Messenger conversion through the real API preserves CRM data and rejects unauthorized writes", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  assertDisposableDatabase(process.env.TEST_DATABASE_URL, process.env.DISPOSABLE_TEST_DATABASE_HOST, process.env.DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = randomUUID();
  try {
    const { getDb } = await import("../src/db");
    const db = getDb();
    const { createSessionToken, SESSION_COOKIE } = await import("../src/services/request-auth");
    const { setUserAccessScope } = await import("../src/services/access-scope");
    const { POST } = await import("../src/app/api/leads/from-messenger/route");
    const own = randomUUID(), outside = randomUUID(), actor = randomUUID();
    const conversation = randomUUID(), hidden = randomUUID();
    const lastContact = "2026-10-08T06:00:00.000Z";
    for (const page of [own, outside]) await db.execute(sql`insert into facebook_pages(id,name,facebook_page_id) values(${page}::uuid,'Conversion QA',${`qa-${page}`})`);
    for (const [id, page] of [[conversation, own], [hidden, outside]]) await db.execute(sql`insert into messenger_conversations(id,page_id,facebook_conversation_id,participant_id,participant_name,last_customer_message_at,unread) values(${id}::uuid,${page}::uuid,${`qa-${id}`},${`customer-${id}`},'عميل اختبار',${lastContact}::timestamptz,true)`);
    await db.execute(sql`insert into users(id,email,role) values(${actor}::uuid,${`${actor}@example.invalid`},'editor')`);
    await setUserAccessScope(actor, { unrestricted: false, accountIds: [], pageIds: [own] });
    // A stale elevated role in the cookie must not override the current database role.
    const token = await createSessionToken({ userId: actor, role: "admin" });
    const request = (id: string, origin = "http://localhost") => new NextRequest("http://localhost/api/leads/from-messenger", { method: "POST", headers: { origin, cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json" }, body: JSON.stringify({ conversationId: id }) });
    const responses = await Promise.all([POST(request(conversation)), POST(request(conversation))]);
    assert.deepEqual(responses.map(r => r.status), [200, 200]);
    const results = await Promise.all(responses.map(r => r.json()));
    assert.equal(results[0].id, results[1].id);
    const leadId = String(results[0].id);
    const rows = (await db.execute(sql`select id,page_id,name,contact,source,status,last_contact_at from leads where messenger_conversation_id=${conversation}::uuid`)).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].page_id, own);
    assert.equal(rows[0].name, "عميل اختبار");
    assert.equal(rows[0].contact, `customer-${conversation}`);
    assert.equal(rows[0].source, "messenger");
    assert.equal(new Date(String(rows[0].last_contact_at)).toISOString(), lastContact);
    await db.execute(sql`update leads set status='qualified',notes='احتفظ بالملاحظات',assigned_to=${actor}::uuid where id=${leadId}::uuid`);
    assert.equal((await POST(request(conversation))).status, 200);
    const saved = (await db.execute(sql`select status,notes,assigned_to from leads where id=${leadId}::uuid`)).rows[0];
    assert.deepEqual(saved, { status: "qualified", notes: "احتفظ بالملاحظات", assigned_to: actor });
    assert.equal((await db.execute(sql`select unread from messenger_conversations where id=${conversation}::uuid`)).rows[0].unread, true);
    assert.equal((await POST(request(hidden))).status, 404);
    assert.equal((await POST(request(hidden, "https://attacker.example.invalid"))).status, 403);
    assert.equal((await POST(request("invalid"))).status, 400);
    await db.execute(sql`update users set role='viewer' where id=${actor}::uuid`);
    assert.equal((await POST(request(conversation))).status, 403);
    await db.execute(sql`update users set is_active=false where id=${actor}::uuid`);
    assert.equal((await POST(request(conversation))).status, 401);
    assert.equal((await db.execute(sql`select count(*)::int as n from leads where messenger_conversation_id=${hidden}::uuid`)).rows[0].n, 0);
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  }
});
