import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { parseUserAccessScope } from './access-scope-model';
import type { LeadAssignmentAuthorization } from './leads-bulk';

const accountsSchema=z.array(z.object({id:z.string(),pageIds:z.array(z.string()).default([]),instagramIds:z.array(z.string()).default([])}));
export function parseLeadAssignmentAuthorization(role:unknown,scopeValue:string|null,catalogValue:string|null):LeadAssignmentAuthorization|null{
  if(role!=='admin'&&role!=='editor')return null;
  try{
    const scope=role==='admin'||scopeValue===null?{unrestricted:true,pageIds:[],accountIds:[]}:parseUserAccessScope(JSON.parse(scopeValue));
    const accounts=!scope.unrestricted&&scope.accountIds.length&&catalogValue!==null?accountsSchema.parse(JSON.parse(catalogValue)):[];
    const remoteIds=accounts.filter(account=>scope.accountIds.includes(account.id)).flatMap(account=>[...account.pageIds,...account.instagramIds]);
    return {role,scopeValue,catalogValue,unrestricted:scope.unrestricted,pageIds:scope.pageIds,remoteIds:Array.from(new Set(remoteIds))};
  }catch{return null;}
}
/** One database snapshot for the role and raw authorization settings used by the write gate. */
export async function loadLeadAssignmentAuthorization(id:string){
  const result=await getDb().execute(sql`select u.role,
    (select value from settings where key=${`user_access_scope:${id}`}) as scope_value,
    (select value from settings where key='meta_accounts_v1') as catalog_value
    from users u where u.id=${id}::uuid and u.is_active=true limit 1`);
  const row=result.rows[0];
  return row?parseLeadAssignmentAuthorization(row.role,row.scope_value===null?null:String(row.scope_value),row.catalog_value===null?null:String(row.catalog_value)):null;
}
