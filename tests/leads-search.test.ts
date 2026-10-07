import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { leadSearchQuery } from "../src/services/leads-search";
const dialect=new PgDialect();
test("lead discovery binds page scope and returns no contact or notes",()=>{
  const page="8a79eb88-d269-44de-bee6-243ca0391432";
  const query=dialect.sqlToQuery(leadSearchQuery("عميل",new Set([page])));
  assert.match(query.sql,/select id,name as text/);
  assert.match(query.sql,/page_id in/);assert.match(query.sql,/limit 5/);
  assert.ok(query.params.includes(page));assert.equal(query.sql.includes(page),false);
  assert.match(dialect.sqlToQuery(leadSearchQuery("name",new Set())).sql,/where false/);
});
test("lead discovery treats wildcard input literally and bounds its size",()=>{
  const query=dialect.sqlToQuery(leadSearchQuery("_%\\'",null));
  assert.ok(query.params.includes("%\\_\\%\\\\'%"));
  assert.equal(query.sql.includes("_%"),false);
  assert.ok(dialect.sqlToQuery(leadSearchQuery("x".repeat(200),null)).params.includes(`%${"x".repeat(100)}%`));
});
