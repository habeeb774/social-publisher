import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { leadOwnershipScope,leadOwnership } from "../src/services/leads-ownership";
import { leadBoardQuery } from "../src/services/leads-board-data";
import { leadListHref } from "../src/services/leads-filters";
const id="acf36f18-958e-49d2-bd78-93ab243a9457",dialect=new PgDialect();
test("my leads binds the authenticated user and excludes non-database admin ids",()=>{
  const query=dialect.sqlToQuery(leadOwnershipScope("mine",id));
  assert.equal(query.sql,"l.assigned_to=$1::uuid");assert.deepEqual(query.params,[id]);
  assert.equal(dialect.sqlToQuery(leadOwnershipScope("mine","env-admin")).sql,"false");
  assert.equal(dialect.sqlToQuery(leadOwnershipScope("unassigned",id)).sql,"l.assigned_to is null");
});
test("ownership never replaces the page scope and survives pagination",()=>{
  const query=dialect.sqlToQuery(leadBoardQuery(new Set(),"",undefined,undefined,"mine",id));
  assert.match(query.sql,/l.status=stages.stage and false/);assert.match(query.sql,/l.assigned_to=/);
  const url=new URL(leadListHref("عميل","new","cursor","mine"),"https://example.com");
  assert.equal(url.searchParams.get("ownership"),"mine");assert.equal(url.searchParams.get("cursor"),"cursor");
  assert.equal(leadOwnership("another-user-id"),"all");
});
