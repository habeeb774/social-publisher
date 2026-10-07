import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { leadPageScope } from "./leads-access";
import { decodeLeadCursor, encodeLeadCursor, leadSearchPattern } from "./leads-filters";
import { LEAD_STAGES } from "./leads-stages";
export type LeadCard = { id:string; name:string; contact:string|null; status:string; pageName:string|null; updatedAt:string };
export type LeadColumn = { items:LeadCard[]; cursor:string|null };
export function leadBoardQuery(allowed:ReadonlySet<string>|null,q:string,stage?:string,cursor?:ReturnType<typeof decodeLeadCursor>) {
  const stages=stage?[stage]:LEAD_STAGES;
  return sql`select entries.* from (values ${sql.join(stages.map(value=>sql`(${value}::text)`),sql`, `)}) as stages(stage)
    cross join lateral (select l.id,l.name,l.contact,l.status,l.updated_at::text as updated_at,p.name as page_name,
      to_char(l.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_time
      from leads l left join facebook_pages p on p.id=l.page_id
      where l.status=stages.stage and ${leadPageScope(allowed,"l.page_id")}
      and (${q}='' or l.name ilike ${leadSearchPattern(q)} or l.contact ilike ${leadSearchPattern(q)})
      and ${cursor?sql`(l.updated_at,l.id)<(${cursor.time}::timestamptz,${cursor.id}::uuid)`:sql`true`}
      order by l.updated_at desc,l.id desc limit 21) entries order by entries.status,entries.updated_at::timestamptz desc,entries.id desc`;
}
export async function readLeadBoard(allowed:ReadonlySet<string>|null,q:string,stage?:string,cursor?:ReturnType<typeof decodeLeadCursor>) {
  const result=await getDb().execute(leadBoardQuery(allowed,q,stage,cursor));
  return leadBoardColumns(result.rows,stage);
}
export function leadBoardColumns(rows:Record<string,unknown>[],stage?:string) {
  const columns:Record<string,LeadColumn>={};
  for(const status of stage?[stage]:LEAD_STAGES){
    const matches=rows.filter(row=>row.status===status),visible=matches.slice(0,20),last=visible.at(-1);
    columns[status]={items:visible.map(row=>({id:String(row.id),name:String(row.name),contact:row.contact?String(row.contact):null,status:String(row.status),pageName:row.page_name?String(row.page_name):null,updatedAt:String(row.updated_at)})),cursor:matches.length>20&&last?encodeLeadCursor(String(last.cursor_time),String(last.id)):null};
  }
  return columns;
}
