import { sql } from "drizzle-orm";
import { z } from "zod";
import { notifications } from "@/db/schema";
/** Legacy unowned system alerts are administrative; personal notifications are private. */
export function notificationScope(user:{id:string;role:string}){
  const own=z.uuid().safeParse(user.id).success?sql`${notifications.userId}=${user.id}::uuid`:sql`false`;
  return user.role==="admin"?sql`(${own} or ${notifications.userId} is null)`:own;
}
