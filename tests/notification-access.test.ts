import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest,NextResponse } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { notificationScope } from "../src/services/notification-access";
import { createNotificationHandlers } from "../src/services/notification-handlers";
const id="acf36f18-958e-49d2-bd78-93ab243a9457",dialect=new PgDialect();
test("notification scopes exclude other users even for administrators",()=>{
  const own=dialect.sqlToQuery(notificationScope({id,role:"editor"}));
  assert.deepEqual(own.params,[id]);assert.equal(own.sql.includes("is null"),false);
  const admin=dialect.sqlToQuery(notificationScope({id,role:"admin"}));
  assert.deepEqual(admin.params,[id]);assert.match(admin.sql,/or .*is null/);
  assert.equal(dialect.sqlToQuery(notificationScope({id:"env-admin",role:"viewer"})).sql,"false");
  assert.match(dialect.sqlToQuery(notificationScope({id:"env-admin",role:"admin"})).sql,/false or .*is null/);
});
test("list, unread count and mark-read use the same authenticated owner scope",async()=>{
  const scopes:string[]=[];
  const capture=(scope:Parameters<typeof dialect.sqlToQuery>[0])=>{const query=dialect.sqlToQuery(scope);assert.deepEqual(query.params,[id]);scopes.push(query.sql);};
  const handlers=createNotificationHandlers({authorize:async()=>null,user:async()=>({id,role:"viewer"}),list:async scope=>{capture(scope);return [{id:"personal"}];},unread:async scope=>{capture(scope);return 1;},markRead:async scope=>{capture(scope);}});
  const response=await handlers.GET(new NextRequest("https://example.com/api/notifications?userId=someone-else"));
  assert.deepEqual(await response.json(),{items:[{id:"personal"}],unread:1});assert.equal(response.headers.get("cache-control"),"private, no-store");
  assert.equal((await handlers.POST(new NextRequest("https://example.com/api/notifications",{method:"POST"}))).status,200);
  assert.equal(scopes.length,3);assert.equal(new Set(scopes).size,1);
});
test("authorization denial and removed users never query notifications",async()=>{
  let calls=0;const deps={user:async()=>null,list:async()=>{calls++;return [];},unread:async()=>{calls++;return 0;},markRead:async()=>{calls++;}};
  const denied=createNotificationHandlers({...deps,authorize:async()=>NextResponse.json({error:"رفض"},{status:403})});
  assert.equal((await denied.POST(new NextRequest("https://example.com/api/notifications",{method:"POST"}))).status,403);
  const removed=createNotificationHandlers({...deps,authorize:async()=>null});
  assert.equal((await removed.GET(new NextRequest("https://example.com/api/notifications"))).status,401);assert.equal(calls,0);
});
test("notification failures return safe Arabic errors without internal details",async()=>{
  const handlers=createNotificationHandlers({authorize:async()=>null,user:async()=>({id,role:"viewer"}),list:async()=>{throw new Error("database-secret");},unread:async()=>0,markRead:async()=>{throw new Error("database-secret");}});
  for(const response of [await handlers.GET(new NextRequest("https://example.com/api/notifications")),await handlers.POST(new NextRequest("https://example.com/api/notifications",{method:"POST"}))]){
    assert.equal(response.status,503);assert.equal((await response.text()).includes("database-secret"),false);
  }
});
