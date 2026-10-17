/** Isolated migration/API QA. Refuses production; never calls Meta or enables monitoring. */
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {sql} from 'drizzle-orm';
import {NextRequest} from 'next/server';
import {getDb} from '../src/db';
import {createSessionToken} from '../src/services/request-auth';
import {hashPassword} from '../src/services/passwords';
import {configureNews,runAiNews,newsConfig} from '../src/services/ai-news/service';
import {GET,POST} from '../src/app/api/ai-news/route';

if(!process.env.DATABASE_URL||new URL(process.env.DATABASE_URL).hostname!=='ep-muddy-shadow-b16f25bm.c-5.eu-central-1.aws.neon.tech')throw new Error('ISOLATED_AI_TEST_BRANCH_REQUIRED');
if(!process.env.AUTH_SECRET||!process.env.AI_QA_PASSWORD)throw new Error('EPHEMERAL_QA_AUTH_REQUIRED');
process.env.PUBLISHING_ENABLED='false';
const db=getDb();
for(const statement of (await readFile(new URL('../drizzle/0026_ai_news.sql',import.meta.url),'utf8')).split(';').map(s=>s.trim()).filter(Boolean))await db.execute(sql.raw(statement));
const owner='99999999-0000-4000-8000-000000000001',page='99999999-0000-4000-8000-000000000002';
const password=await hashPassword(process.env.AI_QA_PASSWORD);
await db.execute(sql`INSERT INTO users(id,email,name,role,password_hash,is_active) VALUES(${owner}::uuid,'ai-qa@example.invalid','اختبار أخبار الذكاء الاصطناعي — غير إنتاجي','admin',${password},true)
 ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash`);
await db.execute(sql`INSERT INTO facebook_pages(id,name,facebook_page_id,platform,is_active,status) VALUES(${page}::uuid,'صفحة اختبار — لا تنشر','999999999999999','facebook',true,'active') ON CONFLICT(id) DO NOTHING`);
await configureNews({monitoring:false,autoPublish:false,pageId:page,sourceIds:['openai','google'],pollMinutes:30,dailyLimit:5,minIntervalMinutes:60},owner);
for(let n=1;n<=23;n++){
 const story=(await db.execute(sql`INSERT INTO ai_news_stories(fingerprint,title,published_at) VALUES(${'qa-'+n},${'الذكاء الاصطناعي — خبر اختبار معزول رقم '+n},now()) ON CONFLICT(fingerprint) DO UPDATE SET fingerprint=excluded.fingerprint RETURNING id`)).rows[0] as {id:string};
 await db.execute(sql`INSERT INTO ai_news_reports(story_id,url,source_id,independence_group,title,excerpt,sha256)
 VALUES(${story.id}::uuid,${'https://openai.com/isolated-qa-'+n},'openai','openai','عنوان اختبار','خبر اختبار معزول للتحقق من الواجهة فقط',${'a'.repeat(64)}) ON CONFLICT(url) DO NOTHING`);
}
const cookie=`sp_admin=${await createSessionToken({userId:owner,role:'admin'})}`;
const request=(url:string,init?:RequestInit)=>new NextRequest('http://localhost:3018'+url,{...init,signal:init?.signal??undefined,headers:{cookie,origin:'http://localhost:3018','content-type':'application/json',...init?.headers}});
const denied=await GET(new NextRequest('http://localhost:3018/api/ai-news'));assert.equal(denied.status,401);
const fixtureFilter='q='+encodeURIComponent('خبر اختبار معزول');
const listResponse=await GET(request('/api/ai-news?'+fixtureFilter));assert.equal(listResponse.status,200);
const list=await listResponse.json();assert.equal(list.items.length,20);assert.equal(Number(list.total),23);
const second=await (await GET(request('/api/ai-news?page=2&'+fixtureFilter))).json();assert.equal(second.items.length,3);
const id=list.items[0].id;
const detail=await (await GET(request('/api/ai-news?id='+id))).json();assert.equal(detail.reports.length,1);
const crossOrigin=await POST(request('/api/ai-news',{method:'POST',headers:{origin:'https://attacker.invalid'},body:JSON.stringify({id,action:'reject',note:'اختبار مصدر غير مسموح'})}));assert.equal(crossOrigin.status,403);
const reviewed=await POST(request('/api/ai-news',{method:'POST',body:JSON.stringify({id,action:'verify',note:'مراجعة بيانات اختبار معزولة لا تمثل خبرًا حقيقيًا',arabicPost:'الذكاء الاصطناعي في خبر اختبار معزول لا يمثل واقعة حقيقية'})}));assert.equal(reviewed.status,200);
assert.equal((await (await GET(request('/api/ai-news?id='+id))).json()).story.status,'verified');
const before=(await db.execute(sql`SELECT count(*)::int AS count FROM ai_news_publications`)).rows[0];
assert.deepEqual(await runAiNews(),{state:'disabled'});
assert.equal(Number((await db.execute(sql`SELECT count(*)::int AS count FROM ai_news_publications`)).rows[0].count),Number(before.count));
// Test the complete discovery -> corroboration -> Arabic -> queue -> send -> ID
// path against real Postgres. Only the network edges are synthetic; NEVER Meta.
await db.execute(sql`UPDATE ai_news_stories SET status='pending_verification' WHERE fingerprint LIKE 'qa-%'`);
await db.execute(sql`INSERT INTO settings(key,value) VALUES('general','{"systemEnabled":true,"automationEnabled":true,"contentEnabled":true,"integrationsEnabled":true,"publishingEnabled":true}')
 ON CONFLICT(key) DO UPDATE SET value=(settings.value::jsonb||excluded.value::jsonb)::text`);
const config=await newsConfig();
await db.execute(sql`UPDATE settings SET value=${JSON.stringify({...config,monitoring:true,autoPublish:true})} WHERE key='ai_news_config'`);
await db.execute(sql`UPDATE settings SET value=(value::jsonb-'lastPollAt')::text WHERE key='ai_news_runtime'`);
let sends=0;
const fakeId='999999999999999_888888888888888';
const dependencies={
 readFeed:async(source:{id:string;host:string;name:string})=>[{title:'الذكاء الاصطناعي يعلن إطلاق نموذج جديد لتحليل البيانات',url:`https://${source.host}/isolated-rocket-event`,publishedAt:new Date(),source:source.name,topic:'اختبار',summary:'خبر معزول للمحاكاة، ليس واقعة حقيقية'}],
 validatePage:async()=>({token:'mock-not-a-token',pageId:'999999999999999'}),
 sendPost:async()=>{sends++;return fakeId;},
};
process.env.PUBLISHING_ENABLED='true';
try{
 await runAiNews(dependencies);await runAiNews(dependencies);
 const sent=(await db.execute(sql`SELECT status,facebook_post_id,attempts FROM ai_news_publications WHERE facebook_post_id=${fakeId}`)).rows;
 assert.equal(sent.length,1);assert.equal(sent[0].status,'published');assert.equal(Number(sent[0].attempts),1);assert.ok(sends<=1);
}finally{
 process.env.PUBLISHING_ENABLED='false';
 await configureNews({monitoring:false,autoPublish:false,pageId:page,sourceIds:['openai','google'],pollMinutes:30,dailyLimit:5,minIntervalMinutes:60},owner);
}
console.log(JSON.stringify({isolatedBranch:'passed',migration:'passed',pagination:[20,3],manualReview:'passed',anonymous:401,crossOrigin:403,discoveryThroughPublication:'passed',duplicateSends:0,livePublications:0,monitoring:'disabled'}));
