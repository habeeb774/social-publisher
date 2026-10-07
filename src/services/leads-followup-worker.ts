import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { allowedPageIds } from "./access-scope";
import { leadFollowupDeliveryQuery } from "./leads-followup-delivery";
import { decodeLeadCursor } from "./leads-filters";
import { nextFollowupScanCursor } from "./leads-followup-scan";
import { getSetting, setSetting } from "./settings-store";

/** Bounded scan; skipped recipients never consume their reminder. */
export async function deliverLeadFollowups() {
  const db=getDb();
  const saved=await getSetting<string|null>("lead_followup_scan_cursor",null,{strict:true});
  let cursor:ReturnType<typeof decodeLeadCursor>=null;
  try {cursor=decodeLeadCursor(saved??undefined);}catch { /* Restart only the scan; authorization is unchanged. */ }
  const candidates=await db.execute(sql`select l.id,l.follow_up_at::text as due_at,
    to_char(l.follow_up_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_time,
    coalesce(l.assigned_to,l.follow_up_owner)::text as recipient,u.role,u.is_active
    from leads l left join users u on u.id=coalesce(l.assigned_to,l.follow_up_owner)
    where l.follow_up_at<=now() and l.follow_up_completed_at is null and l.follow_up_notified_at is null
    and l.status not in ('won','lost')
    and ${cursor?sql`(l.follow_up_at,l.id)>(${cursor.time}::timestamptz,${cursor.id}::uuid)`:sql`true`}
    order by l.follow_up_at,l.id limit 50`);
  let delivered=0,skipped=0,failed=0;
  for(const row of candidates.rows) {
    try {
      const recipient=row.recipient?String(row.recipient):null;
      if(recipient&&(row.is_active!==true||(row.role!=="admin"&&row.role!=="editor"))){skipped++;continue;}
      const allowed=recipient?await allowedPageIds({id:recipient,role:row.role as "admin"|"editor"}):null;
      const result=await db.execute(leadFollowupDeliveryQuery(String(row.id),String(row.due_at),recipient,allowed));
      delivered+=Number(result.rows[0]?.delivered??0);
    } catch {failed++;}
  }
  // Advance past skipped/failed rows without marking them delivered. Wrap to retry
  // on a later run, so one inaccessible prefix cannot starve the rest of the queue.
  await setSetting("lead_followup_scan_cursor",nextFollowupScanCursor(candidates.rows));
  console.info("Lead follow-up dispatch",{scanned:candidates.rows.length,delivered,skipped,failed});
  return {delivered,skipped,failed};
}
