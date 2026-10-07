import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { followupRiyadhToIso,followupScheduleValid,leadFollowupSchema,leadFollowupValues } from "../src/services/leads-followup-model";
import { leadFollowupDeliveryQuery } from "../src/services/leads-followup-delivery";
const version="2026-10-07 10:00:00.123456+00";
test("reminder delivery locks current due version and marks only successfully inserted notifications",()=>{
  const query=new PgDialect().sqlToQuery(leadFollowupDeliveryQuery("acf36f18-958e-49d2-bd78-93ab243a9457",version,null,new Set()));
  assert.match(query.sql,/for update skip locked/);assert.match(query.sql,/follow_up_notified_at is null/);
  assert.match(query.sql,/join created on created.id=due.notification_id/);assert.match(query.sql,/and false/);
  assert.match(query.sql,/status not in \('won','lost'\)/);assert.equal(query.sql.includes(version),false);
});
test("followup forms use Riyadh independently of device zone and reject impossible dates",()=>{
  assert.equal(followupRiyadhToIso("2026-10-08T09:30"),"2026-10-08T06:30:00.000Z");
  for(const value of ["2026-02-31T09:30","2026-10-08T25:30","tomorrow"])assert.throws(()=>followupRiyadhToIso(value));
});
test("followup scheduling is future bounded and requires exact edit version",()=>{
  const now=new Date("2026-10-07T10:00:00Z");
  assert.equal(followupScheduleValid("2026-10-08T09:00:00+03:00",now),true);
  assert.equal(followupScheduleValid(now.toISOString(),now),false);
  assert.equal(followupScheduleValid("2030-01-01T00:00:00Z",now),false);
  assert.equal(leadFollowupSchema.safeParse({action:"schedule",dueAt:"2026-10-08T09:00:00",expectedUpdatedAt:version}).success,false);
  assert.equal(leadFollowupSchema.safeParse({action:"cancel"}).success,false);
});
test("rescheduling resets notification marker; cancel and completion preserve client data",()=>{
  const dialect=new PgDialect();
  const schedule=dialect.sqlToQuery(leadFollowupValues(leadFollowupSchema.parse({action:"schedule",dueAt:"2026-10-08T06:30:00Z",expectedUpdatedAt:version}),null));
  assert.match(schedule.sql,/follow_up_notified_at=null/);assert.equal(schedule.sql.includes("2026-10-08"),false);
  assert.deepEqual(schedule.params,["2026-10-08T06:30:00Z",null]);
  for(const action of ["complete","cancel"] as const){const query=dialect.sqlToQuery(leadFollowupValues(leadFollowupSchema.parse({action,expectedUpdatedAt:version}),null));assert.equal(query.sql.includes("notes="),false);assert.equal(query.sql.includes("status="),false);}
});
