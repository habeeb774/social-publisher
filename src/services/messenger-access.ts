import { sql } from 'drizzle-orm';
/** An absent scope must not be mistaken for unrestricted access. Callers pass null explicitly for admins. */
export function messengerPageScope(allowed:ReadonlySet<string>|null,column:'c.page_id'|'page_id'='c.page_id'){
  if(allowed===null)return sql`true`;
  if(!allowed.size)return sql`false`;
  return sql`${sql.raw(column)} in (${sql.join(Array.from(allowed,id=>sql`${id}::uuid`),sql`, `)})`;
}
export function messengerConversationLookup(id:string,allowed:ReadonlySet<string>|null){
  return sql`select c.id,c.page_id,c.participant_name,c.last_customer_message_at,p.name as page_name
    from messenger_conversations c join facebook_pages p on p.id=c.page_id
    where c.id=${id}::uuid and ${messengerPageScope(allowed)} limit 1`;
}
