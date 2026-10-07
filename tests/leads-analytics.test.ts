import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { leadAnalyticsRange,leadAnalyticsQuery,leadAnalyticsSummary } from "../src/services/leads-analytics";
test("analytics ranges use inclusive Riyadh calendar days and exclusive upper bounds",()=>{
  const range=leadAnalyticsRange({days:"7"},new Date("2026-10-06T22:00:00Z"));
  assert.deepEqual(range,{from:"2026-10-01",to:"2026-10-07",start:"2026-09-30T21:00:00.000Z",end:"2026-10-07T21:00:00.000Z"});
  for(const params of [{from:"2026-02-30"},{from:"2026-10-08",to:"2026-10-07"},{from:"2020-01-01",to:"2026-01-01"},{from:"oops"}])assert.throws(()=>leadAnalyticsRange(params));
});
test("analytics SQL scopes aggregates before grouping and does not select private lead data",()=>{
  const page="8a79eb88-d269-44de-bee6-243ca0391432";
  const range=leadAnalyticsRange({days:"30"});
  const query=new PgDialect().sqlToQuery(leadAnalyticsQuery(range,new Set([page])));
  assert.match(query.sql,/page_id in/);assert.ok(query.params.includes(page));assert.ok(query.params.includes(range.end));
  assert.equal(query.sql.includes(page),false);assert.equal(/contact|notes|assigned_to/.test(query.sql),false);
  assert.match(new PgDialect().sqlToQuery(leadAnalyticsQuery(range,new Set())).sql,/where false/);
});
test("conversion is current won over the creation cohort, with no-data represented as unavailable",()=>{
  assert.equal(leadAnalyticsSummary([]).conversion,null);
  assert.deepEqual(leadAnalyticsSummary([{source:"manual",total:3,won:1,lost:1}]),{total:3,won:1,lost:1,conversion:33.3});
  assert.equal(leadAnalyticsSummary([{source:"messenger",total:2,won:0,lost:1}]).conversion,0);
});
