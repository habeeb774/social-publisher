import { z } from "zod";
import { sql } from "drizzle-orm";
const version=z.string().max(60).refine(value=>/^\d{4}-\d{2}-\d{2}[ T]/.test(value)&&Number.isFinite(Date.parse(value)));
export const leadFollowupSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("schedule"),dueAt:z.iso.datetime({offset:true}),expectedUpdatedAt:version}).strict(),
  z.object({action:z.literal("complete"),expectedUpdatedAt:version}).strict(),
  z.object({action:z.literal("cancel"),expectedUpdatedAt:version}).strict(),
]);
export function followupScheduleValid(dueAt:string,now=new Date()){
  const time=Date.parse(dueAt);return Number.isFinite(time)&&time>now.getTime()&&time<=now.getTime()+366*86400000;
}
/** Local form values are always Riyadh time, never the browser/device time zone. */
export function followupRiyadhToIso(value:string){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error("INVALID_DATE");
  const date=new Date(`${value}:00+03:00`);
  if(!Number.isFinite(date.getTime())||new Date(date.getTime()+3*3600000).toISOString().slice(0,16)!==value)throw new Error("INVALID_DATE");
  return date.toISOString();
}
export function leadFollowupValues(input:z.infer<typeof leadFollowupSchema>,ownerId:string|null){
  if(input.action==="schedule")return sql`follow_up_at=${input.dueAt}::timestamptz,follow_up_completed_at=null,follow_up_notified_at=null,follow_up_owner=${ownerId}::uuid,updated_at=now()`;
  if(input.action==="complete")return sql`follow_up_completed_at=now(),last_contact_at=now(),updated_at=now()`;
  return sql`follow_up_at=null,follow_up_completed_at=null,follow_up_notified_at=null,follow_up_owner=null,updated_at=now()`;
}
