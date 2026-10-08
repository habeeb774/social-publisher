import test from "node:test";
import assert from "node:assert/strict";
import { reviewHistory } from "../src/services/review-history";
test("review history projects actual actors, dates and reasons without unrelated metadata", () => {
  const result = reviewHistory([
    {id:"a",action:"post.rejected",createdAt:new Date("2026-10-07"),metadata:{actor:" QA ",reason:" تصحيح السعر ",secret:"never display"}},
    {id:"b",action:"post.approved",createdAt:new Date("2026-10-08"),metadata:{actor:42,reason:"not an approval reason"}},
    {id:"c",action:"post.updated",createdAt:new Date(),metadata:{}},
    {id:"d",action:"post.submitted",createdAt:new Date("invalid"),metadata:{}},
  ]);
  assert.deepEqual(result.map(row=>row.id),["b","a"]);
  assert.equal(result[0].actor,null);assert.equal(result[0].reason,null);
  assert.equal(result[1].actor,"QA");assert.equal(result[1].reason,"تصحيح السعر");
  assert.ok(!JSON.stringify(result).includes("never display"));
  assert.deepEqual(reviewHistory([]),[]);
});
test("review history bounds displayed fields and orders same-time events deterministically", () => {
  const createdAt = new Date("2026-10-08T09:00:00Z");
  const result = reviewHistory([
    {id:"a",action:"post.submitted",createdAt,metadata:[]},
    {id:"b",action:"post.changes_requested",createdAt,metadata:{actor:"x".repeat(300),reason:"ر".repeat(1100)}},
    {id:"c",action:"post.rejected",createdAt,metadata:{actor:" ",reason:" "}},
  ]);
  assert.deepEqual(result.map(row=>row.id),["c","b","a"]);
  assert.equal(result[0].actor,null);
  assert.equal(result[0].reason,null);
  assert.equal(result[1].actor?.length,254);
  assert.equal(result[1].reason?.length,1000);
  assert.equal(result[2].actor,null);
});
