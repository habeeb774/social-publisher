import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
if(!process.env.COMMENTS_TEST_DATABASE_URL)throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
const db=neon(process.env.COMMENTS_TEST_DATABASE_URL);
const prefix=`comments-test-${randomUUID()}`;const page=randomUUID(),comment=randomUUID();
try{
 await db`INSERT INTO facebook_pages(id,name,facebook_page_id) VALUES(${page},${prefix},${prefix})`;
 await db`INSERT INTO facebook_comments(id,page_id,facebook_comment_id,message,created_time) VALUES(${comment},${page},${prefix},'test',now())`;
 await db`INSERT INTO facebook_comments(page_id,facebook_comment_id,message,created_time) VALUES(${page},${prefix},'test duplicate',now()) ON CONFLICT(facebook_comment_id) DO NOTHING`;
 const [count]=await db`SELECT count(*)::int AS count FROM facebook_comments WHERE facebook_comment_id=${prefix}`;assert.equal(count.count,1);
 await db`INSERT INTO comment_replies(comment_id,content,reply_type,status) VALUES(${comment},'draft','automation','pending_approval')`;
 await db`INSERT INTO comment_replies(comment_id,content,reply_type,status) VALUES(${comment},'duplicate','automation','pending_approval') ON CONFLICT DO NOTHING`;
 const [replies]=await db`SELECT count(*)::int AS count,count(*) FILTER(WHERE sent_at IS NOT NULL)::int AS sent FROM comment_replies WHERE comment_id=${comment}`;assert.equal(replies.count,1);assert.equal(replies.sent,0);
 await db`UPDATE comment_replies SET status='approved' WHERE comment_id=${comment}`;
 const [approved]=await db`SELECT status,sent_at FROM comment_replies WHERE comment_id=${comment}`;assert.equal(approved.status,'approved');assert.equal(approved.sent_at,null);
 console.log(JSON.stringify({uniqueComment:true,oneAutomationReply:true,approvalDoesNotSend:true,realReplies:0}));
}finally{
 await db.transaction([db`DELETE FROM comment_replies WHERE comment_id=${comment}`,db`DELETE FROM facebook_comments WHERE page_id=${page}`,db`DELETE FROM facebook_pages WHERE id=${page}`]);
}
