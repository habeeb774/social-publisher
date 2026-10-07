import { sql } from "drizzle-orm";
import { z } from "zod";
export const LEAD_OWNERSHIP=["all","mine","unassigned"] as const;
export type LeadOwnership=typeof LEAD_OWNERSHIP[number];
export function leadOwnership(value?:string):LeadOwnership{return value==="mine"||value==="unassigned"?value:"all";}
/** Ownership narrows the page scope; it never replaces authorization. */
export function leadOwnershipScope(view:LeadOwnership,userId:string){
  if(view==="unassigned")return sql`l.assigned_to is null`;
  if(view==="mine")return z.uuid().safeParse(userId).success?sql`l.assigned_to=${userId}::uuid`:sql`false`;
  return sql`true`;
}
