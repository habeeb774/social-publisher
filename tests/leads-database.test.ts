import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { assertDisposableDatabase } from "./database-safety";
import { leadCreateQuery,leadCreateRetryQuery } from "../src/services/leads-create";
import { createLeadPostHandler } from "../src/services/leads-create-handler";
import { leadFollowupDeliveryQuery } from "../src/services/leads-followup-delivery";

const testUrl = process.env.TEST_DATABASE_URL;
test("CRM database workflows on an explicitly disposable database",{ skip: !testUrl && "TEST_DATABASE_URL not set" },async t => {
  assertDisposableDatabase(testUrl,process.env.DISPOSABLE_TEST_DATABASE_HOST,process.env.DATABASE_URL);
  process.env.DATABASE_URL = testUrl;
  const { getDb } = await import("../src/db");
  const db = getDb();
  const pageId = randomUUID();const userId = randomUUID();
  await db.execute(sql`insert into facebook_pages(id,name,facebook_page_id,platform,is_active) values(${pageId}::uuid,'QA CRM',${`qa-${pageId}`},'facebook',true)`);
  await db.execute(sql`insert into users(id,email,name,role,is_active) values(${userId}::uuid,${`${userId}@example.test`},'QA editor','editor',true)`);
  const allowed = new Set([pageId]);

  await t.test("concurrent manual submits create exactly one lead and one creation audit",async () => {
    const id = randomUUID();
    const input = {id,pageId,name:"عميل QA",contact:null,status:"new" as const,notes:null};
    const handler = createLeadPostHandler({
      authorize:async () => null,
      user:async () => ({id:userId,email:"qa@example.test",name:"QA",role:"editor"}),
      scope:async () => allowed,
      insert:async (data,scope) => (await db.execute(leadCreateQuery(data,scope))).rows.length>0,
      retry:async (data,scope) => (await db.execute(leadCreateRetryQuery(data,scope))).rows.length>0,
      audit:async entityId => { await db.execute(sql`insert into activity_logs(action,entity_type,entity_id,metadata) values('lead.created','lead',${entityId},'{}'::jsonb)`); },
    });
    const req = () => new NextRequest("https://qa.example.test/api/leads",{method:"POST",body:JSON.stringify(input),headers:{"content-type":"application/json"}});
    const responses = await Promise.all([handler(req()),handler(req())]);
    assert.deepEqual(responses.map(r => r.status).sort(),[200,201]);
    assert.equal((await db.execute(sql`select count(*)::int as n from leads where id=${id}::uuid`)).rows[0].n,1);
    assert.equal((await db.execute(sql`select count(*)::int as n from activity_logs where action='lead.created' and entity_id=${id}`)).rows[0].n,1);
    assert.equal((await db.execute(leadCreateRetryQuery({...input,name:"different"},allowed))).rows.length,0);
    assert.equal((await db.execute(leadCreateRetryQuery(input,new Set()))).rows.length,0);
  });

  await t.test("empty or mismatched page scopes and inactive pages cannot insert records",async () => {
    const input = {id:randomUUID(),pageId,name:"Denied",contact:null,status:"new" as const,notes:null};
    for(const scope of [new Set<string>(),new Set([randomUUID()])])assert.equal((await db.execute(leadCreateQuery(input,scope))).rows.length,0);
    await db.execute(sql`update facebook_pages set is_active=false where id=${pageId}::uuid`);
    assert.equal((await db.execute(leadCreateQuery(input,null))).rows.length,0);
    await db.execute(sql`update facebook_pages set is_active=true where id=${pageId}::uuid`);
  });

  async function dueLead(status="new") {
    const id = randomUUID();
    const rows = await db.execute(sql`insert into leads(id,page_id,name,source,status,assigned_to,follow_up_at)
      values(${id}::uuid,${pageId}::uuid,'QA reminder','manual',${status},${userId}::uuid,now()-interval '1 minute') returning follow_up_at::text as due`);
    return {id,due:String(rows.rows[0].due)};
  }
  await t.test("overlapping follow-up deliveries produce one notification and one marker",async () => {
    const lead = await dueLead();
    const results = await Promise.all([db.execute(leadFollowupDeliveryQuery(lead.id,lead.due,userId,allowed)),db.execute(leadFollowupDeliveryQuery(lead.id,lead.due,userId,allowed))]);
    assert.equal(results.reduce((n,r) => n+Number(r.rows[0].delivered),0),1);
    assert.equal((await db.execute(sql`select count(*)::int as n from notifications where user_id=${userId}::uuid and type='lead_followup_due'`)).rows[0].n,1);
    assert.equal((await db.execute(sql`select follow_up_notified_at is not null as notified from leads where id=${lead.id}::uuid`)).rows[0].notified,true);
  });
  await t.test("stale due times, inaccessible pages, closed leads and inactive recipients remain unnotified",async () => {
    const lead = await dueLead();
    const delivered = async (due=lead.due,scope:ReadonlySet<string>|null=allowed) => Number((await db.execute(leadFollowupDeliveryQuery(lead.id,due,userId,scope))).rows[0].delivered);
    assert.equal(await delivered(new Date(0).toISOString()),0);
    assert.equal(await delivered(lead.due,new Set()),0);
    await db.execute(sql`update users set is_active=false where id=${userId}::uuid`);
    assert.equal(await delivered(),0);
    await db.execute(sql`update users set is_active=true where id=${userId}::uuid`);
    for(const status of ["won","lost"]){await db.execute(sql`update leads set status=${status} where id=${lead.id}::uuid`);assert.equal(await delivered(),0);}
    assert.equal((await db.execute(sql`select follow_up_notified_at is null as untouched from leads where id=${lead.id}::uuid`)).rows[0].untouched,true);
  });
});
