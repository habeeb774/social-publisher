import { neon } from "@neondatabase/serverless";
const database=()=>neon(process.env.DATABASE_URL!);
export async function commentNotifications(owner:string){const db=database();const [items,counts]=await Promise.all([
 db`SELECT n.id,n.title,n.message,n.created_at AS "createdAt",(r.notification_id IS NOT NULL) AS "isRead" FROM notifications n LEFT JOIN comment_notification_reads r ON r.notification_id=n.id AND r.owner=${owner} WHERE n.type LIKE 'comment_%' ORDER BY n.created_at DESC LIMIT 30`,
 db`SELECT count(*)::int AS unread FROM notifications n WHERE n.type LIKE 'comment_%' AND NOT EXISTS(SELECT 1 FROM comment_notification_reads r WHERE r.notification_id=n.id AND r.owner=${owner})`
 ]);return {items,unread:counts[0].unread};}
export async function readCommentNotifications(owner:string){await database()`INSERT INTO comment_notification_reads(notification_id,owner) SELECT id,${owner} FROM notifications WHERE type LIKE 'comment_%' ON CONFLICT DO NOTHING`;return {ok:true};}
