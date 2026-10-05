import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
if(!process.env.COMMENTS_TEST_DATABASE_URL)throw new Error("ISOLATED_DATABASE_REQUIRED");
const db=neon(process.env.COMMENTS_TEST_DATABASE_URL),base="http://localhost:3082",page=randomUUID(),prefix=`pagination-${randomUUID()}`;
const login=await fetch(`${base}/api/auth/login`,{method:"POST",redirect:"manual",body:new URLSearchParams({email:"comments-test@example.invalid",password:"local-comments-test-only"})});const cookie=login.headers.get("set-cookie").split(";")[0];
const get=async(query)=>{const response=await fetch(`${base}/api/comments?${query}`,{headers:{cookie}});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;};
try{
 await db`INSERT INTO facebook_pages(id,name,facebook_page_id) VALUES(${page},${prefix},${prefix})`;
 await db`INSERT INTO facebook_comments(page_id,facebook_comment_id,message,created_time,sentiment) SELECT ${page}::uuid,${prefix}||g,'السعر للاختبار','2026-10-05T09:00:00.123456Z'::timestamptz,'price' FROM generate_series(1,52) g`;
 const first=await get(`page=${page}`);assert.equal(first.items.length,50);assert.ok(first.nextCursor);
 const second=await get(`page=${page}&cursor=${first.nextCursor}`);assert.equal(second.items.length,2);assert.equal(new Set([...first.items,...second.items].map(c=>c.id)).size,52);
 const absent=await get(`page=${page}&sentiment=complaint`);assert.equal(absent.items.length,0);
 const date=await get(`page=${page}&from=2026-10-06`);assert.equal(date.items.length,0);
 const analytics=await get("view=analytics");assert.ok(analytics.total>=52);assert.ok(analytics.keywords.some(k=>k.word==="السعر"));assert.ok(analytics.byPost.some(p=>p.count>=52));
 console.log(JSON.stringify({cursorNoLossWithEqualTimestamps:true,dateFilters:true,sentimentFilters:true,realAnalyticsQueries:true}));
}finally{await db.transaction([db`DELETE FROM facebook_comments WHERE page_id=${page}`,db`DELETE FROM facebook_pages WHERE id=${page}`]);}
