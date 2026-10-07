import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { createGuard } from "../src/services/api-guard";
import { createLeadPostHandler } from "../src/services/leads-create-handler";
import { leadCreateQuery,leadCreateRetryQuery,leadCreateSchema } from "../src/services/leads-create";
import type { CurrentUser } from "../src/services/rbac";
import type { Session } from "../src/services/request-auth";

const id = "b949d271-8a4f-43be-82f8-2d1bc37d8112";
const pageId = "8a79eb88-d269-44de-bee6-243ca0391432";
const body = { id,pageId,name: "عميل يدوي",contact: null,status: "new",notes: null };
const actor: CurrentUser = { id:"9eb83325-3810-4fc6-aa29-2711d6d9810b",email:"fixture@example.test",name:"محرر",role:"editor" };
function request(value: unknown = body, origin = "https://app.example.test") {
  return new NextRequest("https://app.example.test/api/leads",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(value)});
}
function harness(options: { user?:CurrentUser|null; allowed?:ReadonlySet<string>|null; inserted?:boolean; retried?:boolean; failure?:boolean } = {}) {
  const user = options.user === undefined ? actor : options.user;
  const allowed = options.allowed === undefined ? new Set([pageId]) : options.allowed;
  const events: string[] = [];
  const authorize = createGuard({
    readSession: async () => ({ userId:actor.id,role:"editor",email:actor.email } as Session),
    readUser: async () => user,
    bindActor: () => {},
  });
  const handler = createLeadPostHandler({
    authorize:r => authorize(r,true,"leads.create"),
    user:async () => user,
    scope:async () => { events.push("scope"); if(options.failure)throw new Error("secret database diagnostic"); return allowed; },
    insert:async (input,scope) => { events.push("insert"); assert.equal(input.id,id);assert.equal(scope,allowed);return options.inserted ?? true; },
    retry:async () => { events.push("retry");return options.retried ?? false; },
    audit:async value => { events.push("audit");assert.equal(value,id); },
  });
  return { handler,events };
}

test("manual lead validation excludes spoofed source, assignment, conversation and timestamps",() => {
  assert.equal(leadCreateSchema.parse({ ...body,name:"  عميل  " }).name,"عميل");
  for (const value of [null,{}, { ...body,name:"  " },{ ...body,name:"x".repeat(161) },{ ...body,contact:"x".repeat(501) },{ ...body,notes:"x".repeat(10001) },{ ...body,pageId:null },{ ...body,id:"bad" },{ ...body,status:"fake" },...['source','assignedTo','messengerConversationId','createdAt'].map(key => ({ ...body,[key]:"spoof" }))]) assert.equal(leadCreateSchema.safeParse(value).success,false);
});

test("manual lead SQL parameterizes data, enforces active page scope and prevents duplicate inserts",() => {
  const input = leadCreateSchema.parse({ ...body,name:"'); drop table leads; --" });
  const dialect = new PgDialect();
  const query = dialect.sqlToQuery(leadCreateQuery(input,new Set([pageId])));
  assert.equal(query.sql.includes(input.name),false);assert.ok(query.params.includes(input.name));
  assert.match(query.sql,/p\.is_active=true/);assert.match(query.sql,/p.id in/);assert.match(query.sql,/on conflict\(id\) do nothing/);
  assert.match(dialect.sqlToQuery(leadCreateQuery(input,new Set())).sql,/and false/);
  assert.match(dialect.sqlToQuery(leadCreateQuery(input,null)).sql,/and true/);
  const retry = dialect.sqlToQuery(leadCreateRetryQuery(input,new Set([pageId])));
  for(const condition of [/l.source='manual'/,/messenger_conversation_id is null/,/p.is_active=true/,/l.page_id in/,/l.contact is not distinct from/,/l.notes is not distinct from/,/l.status=/]) assert.match(retry.sql,condition);
  assert.equal(retry.sql.includes(input.name),false);
});

test("actual manual lead handler creates and audits once, returns only the ID",async () => {
  const {handler,events} = harness();
  const response = await handler(request());
  assert.equal(response.status,201);assert.deepEqual(await response.json(),{id});
  assert.deepEqual(events,["scope","insert","audit"]);
});

test("identical retry succeeds without a second audit; conflicting ID never leaks record data",async () => {
  for(const retried of [true,false]){
    const {handler,events} = harness({inserted:false,retried});
    const response = await handler(request());
    assert.equal(response.status,retried ? 200 : 409);
    const result = await response.json();assert.equal(result.name,undefined);assert.equal(result.contact,undefined);
    assert.deepEqual(events,["scope","insert","retry"]);
  }
});

test("same-origin, current role, active user, input and page access are checked before insertion",async () => {
  for(const [options,req,status] of [
    [{},request(body,"https://attacker.example.test"),403],
    [{user:{...actor,role:"viewer" as const}},request(),403],
    [{user:{...actor,role:"reviewer" as const}},request(),403],
    [{user:null},request(),401],
    [{allowed:new Set<string>()},request(),404],
    [{allowed:new Set([id])},request(),404],
    [{},request({...body,source:"messenger"}),400],
  ] as const){
    const {handler,events} = harness(options);const response = await handler(req);
    assert.equal(response.status,status);assert.equal(events.includes("insert"),false);
  }
});

test("unrestricted users can create; scope failures return safe error without writes",async () => {
  assert.equal((await harness({allowed:null}).handler(request())).status,201);
  const {handler,events} = harness({failure:true});
  const response = await handler(request());assert.equal(response.status,503);
  assert.equal((await response.text()).includes("secret database diagnostic"),false);assert.deepEqual(events,["scope"]);
});
