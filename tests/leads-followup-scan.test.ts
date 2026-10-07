import test from "node:test";
import assert from "node:assert/strict";
import { nextFollowupScanCursor } from "../src/services/leads-followup-scan";
import { decodeLeadCursor } from "../src/services/leads-filters";
test("full reminder batch advances past skipped rows without consuming their reminders",()=>{
  const row={id:"acf36f18-958e-49d2-bd78-93ab243a9457",cursor_time:"2026-10-07T10:00:00.123456Z"};
  const cursor=nextFollowupScanCursor(Array.from({length:50},()=>row));
  assert.deepEqual(decodeLeadCursor(cursor??undefined),{id:row.id,time:row.cursor_time});
  assert.equal(nextFollowupScanCursor([row]),null);
  assert.equal(nextFollowupScanCursor([]),null);
});
