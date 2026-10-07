import { z } from "zod";
import { sql } from "drizzle-orm";
import { leadPageScope } from "./leads-access";
import { LEAD_STAGES } from "./leads-stages";

// The client retains this UUID for retries; a primary key protects concurrent submits.
export const leadCreateSchema = z.object({
  id: z.uuid(),
  pageId: z.uuid(),
  name: z.string().trim().min(1).max(160),
  contact: z.string().trim().max(500).nullable(),
  status: z.enum(LEAD_STAGES),
  notes: z.string().trim().max(10000).nullable(),
}).strict();
export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

export function leadCreateQuery(input: LeadCreateInput, allowed: ReadonlySet<string> | null) {
  return sql`insert into leads(id,page_id,name,contact,status,notes,source)
    select ${input.id}::uuid,p.id,${input.name},${input.contact},${input.status},${input.notes},'manual'
    from facebook_pages p where p.id=${input.pageId}::uuid and p.is_active=true
    and ${leadPageScope(allowed,"p.id")}
    on conflict(id) do nothing returning id`;
}

/** Only an identical, currently accessible manual record counts as a successful retry. */
export function leadCreateRetryQuery(input: LeadCreateInput, allowed: ReadonlySet<string> | null) {
  return sql`select l.id from leads l join facebook_pages p on p.id=l.page_id
    where l.id=${input.id}::uuid and l.page_id=${input.pageId}::uuid
    and ${leadPageScope(allowed,"l.page_id")} and p.is_active=true
    and l.source='manual' and l.messenger_conversation_id is null
    and l.name=${input.name} and l.contact is not distinct from ${input.contact}
    and l.status=${input.status} and l.notes is not distinct from ${input.notes}`;
}
