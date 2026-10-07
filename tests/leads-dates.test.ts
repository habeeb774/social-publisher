import test from "node:test";
import assert from "node:assert/strict";
import { leadDateLabel } from "../src/services/leads-dates";
import { auditLabel } from "../src/services/audit-labels";
test("CRM date display distinguishes absent dates from corrupt dates",()=>{
  assert.equal(leadDateLabel(null),"لم يُسجّل بعد");
  assert.equal(leadDateLabel("bad"),"تاريخ غير متاح");
  assert.equal(leadDateLabel("2026-10-07T06:30:00Z"),leadDateLabel("2026-10-07T09:30:00+03:00"));
});
test("follow-up activity labels describe every supported action",()=>{
  for(const action of ["schedule","complete","cancel"])assert.notEqual(auditLabel(`lead.followup.${action}`),`lead.followup.${action}`);
});
