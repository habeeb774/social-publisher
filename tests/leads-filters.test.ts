import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeLeadCursor, encodeLeadCursor, leadSearchPattern, leadListHref } from "../src/services/leads-filters";
test("lead cursor preserves microseconds and unique tie breaker",()=>{
  const time="2026-10-07T10:20:34.306489Z",id="acf36f18-958e-49d2-bd78-93ab243a9457";
  assert.deepEqual(decodeLeadCursor(encodeLeadCursor(time,id)),{time,id});
  assert.equal(decodeLeadCursor(),null);
  assert.throws(()=>decodeLeadCursor("garbage"));
  assert.throws(()=>decodeLeadCursor("x".repeat(301)));
});
test("lead search escapes LIKE wildcards and links preserve filters",()=>{
  assert.equal(leadSearchPattern("a%_\\"),"%a\\%\\_\\\\%");
  const url=new URL(leadListHref("حبيب","qualified","cursor"),"https://example.com");
  assert.equal(url.searchParams.get("q"),"حبيب");
  assert.equal(url.searchParams.get("status"),"qualified");
  assert.equal(url.searchParams.get("cursor"),"cursor");
});
