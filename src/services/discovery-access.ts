import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { activityLogs,campaigns,mediaAssets } from "../db/schema";

type Scope = ReadonlySet<string> | null;
export function discoveryPageScope(allowed:Scope,column:AnyPgColumn) {
  if(allowed===null)return sql`true`;
  if(!allowed.size)return sql`false`;
  return sql`${column} in (${sql.join([...allowed].map(id=>sql`${id}::uuid`),sql`, `)})`;
}
function joinedPostScope(allowed:Scope) {
  if(allowed===null)return sql`true`;
  if(!allowed.size)return sql`false`;
  return sql`p.page_id in (${sql.join([...allowed].map(id=>sql`${id}::uuid`),sql`, `)})`;
}
export function discoveryMediaScope(allowed:Scope) {
  if(allowed===null)return sql`true`;
  if(!allowed.size)return sql`false`;
  return sql`exists(select 1 from post_media pm join posts p on p.id=pm.post_id
    where pm.url=${mediaAssets.url} and p.deleted_at is null and ${joinedPostScope(allowed)})`;
}
export function discoveryCampaignScope(allowed:Scope) {
  if(allowed===null)return sql`true`;
  if(!allowed.size)return sql`false`;
  return sql`exists(select 1 from posts p where p.campaign_id=${campaigns.id}
    and p.deleted_at is null and ${joinedPostScope(allowed)})`;
}
/** Unknown/global entities cannot be inferred safe for a non-administrator. Filter before LIMIT. */
export function dashboardActivityScope(allowed:Scope,canReadSystem=false) {
  if(allowed===null&&canReadSystem)return sql`true`;
  if(allowed!==null&&!allowed.size)return sql`false`;
  const id=activityLogs.entityId;
  const leadPages=allowed===null?sql`true`:sql`l.page_id in (${sql.join([...allowed].map(value=>sql`${value}::uuid`),sql`, `)})`;
  return sql`((${activityLogs.entityType}='post' and exists(select 1 from posts p where p.id=${id} and p.deleted_at is null and ${joinedPostScope(allowed)}))
    or (${activityLogs.entityType}='lead' and exists(select 1 from leads l where l.id=${id} and ${leadPages})))`;
}
