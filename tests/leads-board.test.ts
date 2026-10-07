import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { leadBoardColumns,leadBoardQuery } from "../src/services/leads-board-data";
import { decodeLeadCursor } from "../src/services/leads-filters";
const id="acf36f18-958e-49d2-bd78-93ab243a9457";
test("board queries bound each stage and enforce page scope in SQL",()=>{
  const query=new PgDialect().sqlToQuery(leadBoardQuery(new Set([id]),"%_"));
  assert.match(query.sql,/cross join lateral/);
  assert.match(query.sql,/l\.page_id in \(/);
  assert.match(query.sql,/limit 21/);
  assert.equal(query.params.includes(id),true);
  assert.equal(query.params.includes("%\\%\\_%"),true);
  const denied=new PgDialect().sqlToQuery(leadBoardQuery(new Set(),""));
  assert.match(denied.sql,/l.status=stages.stage and false/);
});
test("column serialization caps cards, retains exact version, and omits hidden data",()=>{
  const time="2026-10-07T10:20:34.306489Z",version="2026-10-07 10:20:34.306489+00";
  const rows=Array.from({length:21},()=>({id,name:"عميل",status:"new",updated_at:version,cursor_time:time,notes:"private",assigned_to:"hidden"}));
  const columns=leadBoardColumns(rows);
  assert.equal(Object.keys(columns).length,7);
  assert.equal(columns.new.items.length,20);
  assert.equal(columns.won.items.length,0);
  assert.deepEqual(decodeLeadCursor(columns.new.cursor??undefined),{id,time});
  assert.equal(columns.new.items[0].updatedAt,version);
  assert.equal("notes" in columns.new.items[0],false);
  assert.equal(leadBoardColumns(rows.slice(0,20),"new").new.cursor,null);
});
test("board continuation uses timestamp and unique id together",()=>{
  const query=new PgDialect().sqlToQuery(leadBoardQuery(null,"","won",{id,time:"2026-10-07T10:20:34.306489Z"}));
  assert.match(query.sql,/\(l.updated_at,l.id\)</);
  assert.equal(query.params.includes("won"),true);
  assert.equal(query.params.includes(id),true);
});
