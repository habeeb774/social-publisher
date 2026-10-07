import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { LEAD_STAGES } from './leads-stages';
import { leadPageScope } from './leads-access';

export const leadBulkStageSchema = z.object({
  status: z.enum(LEAD_STAGES),
  leads: z.array(z.object({
    id: z.uuid().transform(value => value.toLowerCase()),
    expectedUpdatedAt: z.string().max(60).regex(/^\d{4}-\d{2}-\d{2}[ T]/).refine(value => Number.isFinite(Date.parse(value))),
  }).strict()).min(1).max(50),
}).strict().refine(value => new Set(value.leads.map(lead => lead.id)).size === value.leads.length, 'لا تكرر العميل');
export type LeadBulkStageInput = z.infer<typeof leadBulkStageSchema>;

export const leadBulkAssignmentSchema = z.object({
  assignedTo: z.uuid().transform(value => value.toLowerCase()).nullable(),
  leads: leadBulkStageSchema.shape.leads,
}).strict().refine(value => new Set(value.leads.map(lead => lead.id)).size === value.leads.length, 'لا تكرر العميل');
export type LeadBulkAssignmentInput = z.infer<typeof leadBulkAssignmentSchema>;
/** Server-only authorization snapshot. Never accept this structure from a request body. */
export type LeadAssignmentAuthorization = {
  role: 'admin'|'editor'; scopeValue: string|null; catalogValue: string|null;
  unrestricted: boolean; pageIds: readonly string[]; remoteIds: readonly string[];
};

export function leadBulkAssignmentQuery(input:LeadBulkAssignmentInput,allowed:ReadonlySet<string>|null,actor:string,target:LeadAssignmentAuthorization|null){
  if(input.assignedTo&&!target)throw new Error('LEAD_ASSIGNMENT_AUTHORIZATION_REQUIRED');
  const values=sql.join(input.leads.map(lead=>sql`(${lead.id}::uuid,${lead.expectedUpdatedAt}::timestamptz)`),sql`, `);
  const targetScope=target?.unrestricted?sql`true`:sql`(${leadPageScope(new Set(target?.pageIds??[]),'l.page_id')} or exists (
    select 1 from facebook_pages p where p.id=l.page_id and p.is_active=true
      and ${target?.remoteIds.length?sql`p.facebook_page_id in (${sql.join(target.remoteIds.map(id=>sql`${id}`),sql`, `)})`:sql`false`}
  ))`;
  const targetGuard=input.assignedTo?sql`exists(select 1 from member)
    and (select value from settings where key=${`user_access_scope:${input.assignedTo}`}) is not distinct from ${target!.scopeValue}::text
    and (select value from settings where key='meta_accounts_v1') is not distinct from ${target!.catalogValue}::text`:sql`true`;
  return sql`with requested(id,version) as (values ${values}),
    member as materialized (
      select id from users where id=${input.assignedTo}::uuid and is_active=true
        and role=${target?.role??'editor'} order by id for share
    ), locked as materialized (
      select l.id,l.updated_at,r.version,coalesce(${input.assignedTo?targetScope:sql`true`},false) as eligible
      from leads l join requested r on r.id=l.id
      where ${leadPageScope(allowed,'l.page_id')} order by l.id for update of l
    ), decision as (
      select count(*)::int as accessible,${targetGuard} as target_valid,
        count(*)=${input.leads.length} and coalesce(bool_and(updated_at=version and eligible),false)
        and ${targetGuard} as permitted from locked
    ), changed as (
      update leads l set assigned_to=${input.assignedTo}::uuid,updated_at=clock_timestamp()
      from locked k,decision d where d.permitted and l.id=k.id and l.updated_at=k.updated_at returning l.id
    ), audited as (
      insert into activity_logs(action,entity_type,entity_id,metadata)
      select 'lead.assigned','lead',id,jsonb_build_object('actor',${actor}::text,'assignedTo',${input.assignedTo}::text,'bulk',true)
      from changed returning id
    ) select (select accessible from decision) as accessible,(select target_valid from decision) as target_valid,
      (select count(*)::int from changed) as changed,(select count(*)::int from audited) as audited`;
}

/** A single statement locks in stable ID order, gates every row, updates and audits atomically. */
export function leadBulkStageQuery(input: LeadBulkStageInput, allowed: ReadonlySet<string> | null, actor: string) {
  const values = sql.join(input.leads.map(lead => sql`(${lead.id}::uuid,${lead.expectedUpdatedAt}::timestamptz)`), sql`, `);
  return sql`with requested(id,version) as (values ${values}),
    locked as materialized (
      select l.id,l.updated_at,r.version from leads l join requested r on r.id=l.id
      where ${leadPageScope(allowed,'l.page_id')} order by l.id for update of l
    ), decision as (
      select count(*)::int as accessible,
        count(*)=${input.leads.length} and coalesce(bool_and(updated_at=version),false) as permitted from locked
    ), changed as (
      update leads l set status=${input.status},updated_at=clock_timestamp()
      from locked k,decision d where d.permitted and l.id=k.id and l.updated_at=k.updated_at
      returning l.id
    ), audited as (
      insert into activity_logs(action,entity_type,entity_id,metadata)
      select 'lead.updated','lead',id,jsonb_build_object('actor',${actor}::text,'status',${input.status}::text,'fields',jsonb_build_array('status'),'bulk',true)
      from changed returning id
    ) select (select accessible from decision) as accessible,
      (select count(*)::int from changed) as changed,(select count(*)::int from audited) as audited`;
}
