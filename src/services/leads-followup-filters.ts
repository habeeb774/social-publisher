import { sql } from "drizzle-orm";
export function leadFollowupFilter(value?:string) {
  return value==="due"||value==="upcoming"||value==="completed"?value:"all";
}
/** Must be combined with page and ownership scope, never used as authorization. */
export function leadFollowupScope(filter:ReturnType<typeof leadFollowupFilter>) {
  if(filter==="completed")return sql`l.follow_up_completed_at is not null`;
  if(filter==="due"||filter==="upcoming")return sql`l.follow_up_completed_at is null and l.status not in ('won','lost') and ${filter==="due"?sql`l.follow_up_at<=now()`:sql`l.follow_up_at>now()`}`;
  return sql`true`;
}
