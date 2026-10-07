import {sql} from 'drizzle-orm';
import {messengerPageScope} from './messenger-access';

/** Search message bodies server-side without returning them in global discovery. */
export function inboxSearchQuery(kind:'messenger'|'comments',query:string,allowed:ReadonlySet<string>|null){
  const like=`%${query.trim().slice(0,100).replace(/[\\%_]/g,value=>`\\${value}`)}%`;
  if(kind==='messenger')return sql`select c.id,coalesce(c.participant_name,'متابع') as text
    from messenger_conversations c where ${messengerPageScope(allowed)}
    and (c.participant_name ilike ${like} or c.last_message ilike ${like})
    order by c.last_message_at desc nulls last,c.id desc limit 5`;
  return sql`select c.id,coalesce(c.author_name,'متابع') as text
    from facebook_comments c where ${messengerPageScope(allowed)} and not c.is_from_page
    and (c.author_name ilike ${like} or c.message ilike ${like})
    order by c.created_time desc,c.id desc limit 5`;
}
