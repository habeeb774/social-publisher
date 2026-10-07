import { sql } from "drizzle-orm";
import { leadPageScope } from "./leads-access";

/** Search contacts server-side, but return only the bounded display name and ID. */
export function leadSearchQuery(query:string,allowed:ReadonlySet<string>|null) {
  const like=`%${query.trim().slice(0,100).replace(/[\\%_]/g,value=>`\\${value}`)}%`;
  return sql`select id,name as text from leads where ${leadPageScope(allowed)}
    and (name ilike ${like} or contact ilike ${like})
    order by updated_at desc,id desc limit 5`;
}
