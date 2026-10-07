import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { leadFollowupFilter,leadFollowupScope } from "../src/services/leads-followup-filters";
import { leadListHref } from "../src/services/leads-filters";
test("followup filters exclude closed and completed leads from pending reminders",()=>{
  const dialect=new PgDialect();
  for(const filter of ["due","upcoming"] as const){const query=dialect.sqlToQuery(leadFollowupScope(filter));assert.match(query.sql,/follow_up_completed_at is null/);assert.match(query.sql,/status not in/);assert.match(query.sql,filter==="due"?/follow_up_at<=now\(\)/:/follow_up_at>now\(\)/);}
  assert.equal(leadFollowupFilter("garbage"),"all");
  assert.match(dialect.sqlToQuery(leadFollowupScope("completed")).sql,/follow_up_completed_at is not null/);
});
test("pagination and stage links preserve followup and ownership filters",()=>{
  const url=new URL(leadListHref("حبيب","qualified","cursor","mine","due"),"https://example.test");
  for(const [key,value] of Object.entries({q:"حبيب",status:"qualified",cursor:"cursor",ownership:"mine",followup:"due"}))assert.equal(url.searchParams.get(key),value);
});
