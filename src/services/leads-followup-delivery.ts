import { sql } from "drizzle-orm";
import { leadPageScope } from "./leads-access";
/** The caller resolves the recipient's current page scope before dispatch.
 * Lock + insert + marker are one statement: failed inserts cannot consume a reminder.
 */
export function leadFollowupDeliveryQuery(id:string,dueAt:string,recipient:string|null,allowed:ReadonlySet<string>|null){
  return sql`with due as materialized (
    select id,gen_random_uuid() as notification_id from leads
    where id=${id}::uuid and follow_up_at=${dueAt}::timestamptz and follow_up_at<=now()
    and follow_up_completed_at is null and follow_up_notified_at is null and status not in ('won','lost')
    and ${leadPageScope(allowed)}
    and ${recipient?sql`(assigned_to=${recipient}::uuid or (assigned_to is null and follow_up_owner=${recipient}::uuid))
      and exists(select 1 from users where id=${recipient}::uuid and is_active=true and role in ('admin','editor'))`:sql`assigned_to is null and follow_up_owner is null`}
    for update skip locked
  ), created as (
    insert into notifications(id,user_id,type,title,message)
    select notification_id,${recipient}::uuid,'lead_followup_due','موعد متابعة عميل مستحق','افتح قسم العملاء المحتملين لمراجعة المتابعات المستحقة.' from due returning id
  ), marked as (
    update leads set follow_up_notified_at=now() from due join created on created.id=due.notification_id
    where leads.id=due.id returning leads.id
  ) select count(*)::int as delivered from marked`;
}
