import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { guard } from "@/services/api-guard";
import { currentUser } from "@/services/rbac";
import { createNotificationHandlers } from "@/services/notification-handlers";
const handlers=createNotificationHandlers({
  authorize:(request,write)=>guard(request,write,"content.read"),
  user:currentUser,
  list:scope=>getDb().select().from(notifications).where(scope).orderBy(desc(notifications.createdAt),desc(notifications.id)).limit(20),
  unread:async scope=>{
    const rows=await getDb().select({n:sql<number>`count(*)::int`}).from(notifications).where(and(scope,eq(notifications.isRead,false)));
    return Number(rows[0]?.n??0);
  },
  markRead:async scope=>{await getDb().update(notifications).set({isRead:true}).where(and(scope,eq(notifications.isRead,false)));},
});
export const GET=handlers.GET;
export const POST=handlers.POST;
