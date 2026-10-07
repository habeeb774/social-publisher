import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { parseUserAccessScope } from "./access-scope-model";
import { listMetaAccounts } from "./meta-accounts";
import type { MetaAccountRecord } from "./meta-accounts";
import { leadSearchPattern } from "./leads-filters";

export function leadAssigneeEligible(role:string,scopeValue:string|null,pageId:string|null,remotePageId:string|null,accounts:Pick<MetaAccountRecord,"id"|"pageIds"|"instagramIds">[]){
  if(role==="admin")return true;
  if(role!=="editor")return false;
  try{
    const scope=scopeValue===null?{unrestricted:true,accountIds:[],pageIds:[]}:parseUserAccessScope(JSON.parse(scopeValue));
    if(scope.unrestricted)return true;
    if(!pageId)return false;
    return scope.pageIds.includes(pageId)||Boolean(remotePageId&&accounts.some(account=>scope.accountIds.includes(account.id)&&[...account.pageIds,...account.instagramIds].includes(remotePageId)));
  }catch{return false;}
}
export function leadAssigneesQuery(q:string,cursor:string|null){
  return sql`select u.id,u.name,u.role,s.value as scope_value from users u
    left join settings s on s.key='user_access_scope:'||u.id::text
    where u.is_active=true and u.role in ('admin','editor') and (${q}='' or u.name ilike ${leadSearchPattern(q)})
    and ${cursor?sql`u.id>${cursor}::uuid`:sql`true`} order by u.id limit 21`;
}
export type LeadAssignmentPage = {pageId:string|null;remotePageId:string|null};
/** Eligibility is an intersection, never a union of the selected clients' pages. */
export function leadBulkAssigneeEligible(role:string,scopeValue:string|null,pages:readonly LeadAssignmentPage[],accounts:Pick<MetaAccountRecord,"id"|"pageIds"|"instagramIds">[]){
  return pages.length>0&&pages.length<=50&&pages.every(page=>leadAssigneeEligible(role,scopeValue,page.pageId,page.remotePageId,accounts));
}
export async function listLeadAssigneesForPages(pages:readonly LeadAssignmentPage[],q:string,cursor:string|null){
  if(!pages.length||pages.length>50)throw new Error("LEAD_ASSIGNMENT_SELECTION_INVALID");
  const result=await getDb().execute(leadAssigneesQuery(q,cursor));
  const scanned=result.rows.slice(0,20);
  // One shared catalog read, not one scope/account query per candidate.
  const accounts=scanned.some(row=>row.role!=="admin"&&row.scope_value!==null)?await listMetaAccounts():[];
  const items=scanned.filter(row=>leadBulkAssigneeEligible(String(row.role),row.scope_value===null?null:String(row.scope_value),pages,accounts)).map(row=>({id:String(row.id),name:row.name?String(row.name):"عضو الفريق"}));
  return {items,cursor:result.rows.length>20&&scanned.length?String(scanned.at(-1)!.id):null};
}
export async function listLeadAssignees(pageId:string|null,remotePageId:string|null,q:string,cursor:string|null){
  return listLeadAssigneesForPages([{pageId,remotePageId}],q,cursor);
}
