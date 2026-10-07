import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { leadPageScope } from "../src/services/leads-access";
import { can } from "../src/services/rbac";

const dialect = new PgDialect();
test("lead scope distinguishes unrestricted access from an empty assignment",()=>{
  assert.equal(dialect.sqlToQuery(leadPageScope(null)).sql,"true");
  assert.equal(dialect.sqlToQuery(leadPageScope(new Set())).sql,"false");
});
test("lead page scope is enforced by parameterized SQL for both list and conversion",()=>{
  for(const column of ["page_id","l.page_id"] as const){
    const query=dialect.sqlToQuery(leadPageScope(new Set(["11111111-1111-4111-8111-111111111111"]),column));
    assert.equal(query.sql,`${column} in ($1::uuid)`);
    assert.deepEqual(query.params,["11111111-1111-4111-8111-111111111111"]);
  }
});
test("lead roles allow read-only users to view but never convert conversations",()=>{
  for(const role of ["viewer","reviewer"] as const){assert.equal(can(role,"leads.read"),true);assert.equal(can(role,"leads.create"),false);}
  for(const role of ["admin","editor"] as const)assert.equal(can(role,"leads.create"),true);
  assert.equal(can(null,"leads.read"),false);
});
