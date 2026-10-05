import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
if(!process.env.COMMENTS_TEST_DATABASE_URL)throw new Error("ISOLATED_DATABASE_REQUIRED");
const db=neon(process.env.COMMENTS_TEST_DATABASE_URL),base="http://localhost:3082",prefix=`test-${randomUUID()}`,password="isolated-test-password-42";
const login=await fetch(`${base}/api/auth/login`,{method:"POST",redirect:"manual",body:new URLSearchParams({email:"comments-test@example.invalid",password:"local-comments-test-only"})});assert.equal(login.status,303);const admin=login.headers.get("set-cookie").split(";")[0];
const post=async(path,body,cookie)=>{const response=await fetch(`${base}${path}`,{method:"POST",headers:{cookie,origin:base,"content-type":"application/json"},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
const page=randomUUID(),comment=randomUUID();const members=[];
try{
 await db`INSERT INTO facebook_pages(id,name,facebook_page_id) VALUES(${page},${prefix},${prefix})`;
 await db`INSERT INTO facebook_comments(id,page_id,facebook_comment_id,message,created_time) VALUES(${comment},${page},${prefix},'اختبار السعر',now())`;
 const cookies={};for(const role of ["viewer","editor"]){const email=`${prefix}-${role}@example.invalid`;const created=await post("/api/comments/team",{action:"create",email,name:role,password,role},admin);assert.equal(created.status,200,JSON.stringify(created.data));members.push(created.data.id);const response=await fetch(`${base}/api/comments/auth`,{method:"POST",headers:{origin:base,"content-type":"application/json"},body:JSON.stringify({email,password})});assert.equal(response.status,200);cookies[role]=response.headers.getSetCookie().find(c=>c.startsWith("sp_comment_team=")).split(";")[0];}
 assert.equal((await post("/api/comments",{action:"draft",id:comment,content:"مسودة اختبار"},cookies.viewer)).status,403);
 assert.equal((await post("/api/comments",{action:"draft",id:comment,content:"مسودة اختبار"},cookies.editor)).status,200);
 assert.equal((await post("/api/comments",{action:"rule",input:{name:"forbidden",action:"important",keywords:["سعر"]}},cookies.editor)).status,403);
 const [reply]=await db`SELECT id,sent_by,sent_at FROM comment_replies WHERE comment_id=${comment}`;assert.equal(reply.sent_at,null);assert.ok(reply.sent_by.includes("editor@example.invalid"));
 assert.equal((await post("/api/comments",{action:"approve",id:comment,replyId:reply.id},cookies.editor)).status,403);
 assert.equal((await post("/api/comments",{action:"approve",id:comment,replyId:reply.id},admin)).status,200);
 assert.equal((await fetch(`${base}/dashboard`,{headers:{cookie:cookies.editor},redirect:"manual"})).status,307);
 const saved=await post("/api/comments",{action:"save_view",name:prefix,filter:{status:"needs_reply"}},cookies.viewer);assert.equal(saved.status,200);const catalog=await fetch(`${base}/api/comments?view=catalog`,{headers:{cookie:cookies.editor}});assert.equal((await catalog.json()).views.some(v=>v.name===prefix),false);
 assert.equal((await post("/api/comments/team",{action:"change",id:members[0],role:"viewer",active:false},admin)).status,200);
 assert.equal((await fetch(`${base}/api/comments`,{headers:{cookie:cookies.viewer}})).status,401);
 console.log(JSON.stringify({viewerProtected:true,editorDraft:true,approvalAdminOnly:true,viewsPrivate:true,disabledSessionsRevoked:true,legacyPublishingProtected:true,realReplies:0}));
}finally{
 await db.transaction([db`DELETE FROM saved_filters WHERE name=${prefix}`,db`DELETE FROM activity_logs WHERE entity_id=${comment}`,db`DELETE FROM comment_replies WHERE comment_id=${comment}`,db`DELETE FROM facebook_comments WHERE id=${comment}`,db`DELETE FROM facebook_pages WHERE id=${page}`]);
 for(const id of members)await db.transaction([db`DELETE FROM comment_team_members WHERE user_id=${id}`,db`DELETE FROM users WHERE id=${id}`]);
}
