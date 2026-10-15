import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {PgDialect} from 'drizzle-orm/pg-core';
import type {SQL} from 'drizzle-orm';
import {canonicalUrl,normalizedTitle,similarity,configSchema,validArabicPost,retryDelaySeconds,riyadhDay} from '../src/services/elon-news/model';
import {claimRunQuery,beginSendQuery} from '../src/services/elon-news/queries';
import {sendNewsPost,validateNewsPage,validPagePermission,reconcileNewsPost,NewsGraphError} from '../src/services/elon-news/graph';

test('canonical links and titles deduplicate tracking and Unicode without dropping semantic query IDs',()=>{
 assert.equal(canonicalUrl('https://www.aitnews.com/story/?utm_source=x&fbclid=x&id=7#comments','aitnews.com'),'https://aitnews.com/story?id=7');
 assert.equal(normalizedTitle('BREAKING: Elon Musk — launches rocket!'),normalizedTitle('Elon Musk launches rocket'));
 for(const url of ['http://aitnews.com/a','https://attacker.com/a','https://aitnews.com.attacker.com/a','https://u:p@aitnews.com/a','https://aitnews.com:8443/a'])assert.throws(()=>canonicalUrl(url,'aitnews.com'));
 assert.ok(similarity('Elon Musk launches a new rocket today','Elon Musk launches new rocket today')>.8);
 assert.equal(similarity('Elon Musk rocket launch','Elon Musk announces new AI chip'),0);
});
test('configuration defaults are not permission to publish, frequency is scheduler-compatible',()=>{
 const valid={monitoring:true,autoPublish:true,pageId:'00000000-0000-4000-8000-000000000002',sourceIds:['aitnews'],pollMinutes:10,dailyLimit:5,minIntervalMinutes:60};
 assert.ok(configSchema.safeParse(valid).success);
 for(const update of [{pageId:null},{sourceIds:[]},{monitoring:false},{pollMinutes:1},{dailyLimit:0},{minIntervalMinutes:0},{token:'secret'}])assert.equal(configSchema.safeParse({...valid,...update}).success,false);
 assert.equal(validArabicPost('Elon Musk launches a rocket','Elon Musk launches a rocket'),false);
 assert.equal(validArabicPost('إيلون ماسك يطلق الصاروخ بنجاح','إيلون ماسك يطلق الصاروخ بنجاح'),true);
 assert.equal(validArabicPost('إيلون ماسك يطلق ٩٩ صاروخا اليوم','Elon Musk launches 2 rockets'),false);
 assert.equal(validArabicPost('إيلون ماسك يطلق ٢ صاروخا اليوم','Elon Musk launches 2 rockets'),true);
 assert.deepEqual([1,2,3,4].map(retryDelaySeconds),[60,120,240,480]);
 assert.equal(riyadhDay(new Date('2026-10-14T21:01:00Z')),'2026-10-15');
});
const page='123',token='never-log-this-token';
const validToken={is_valid:true,type:'PAGE',profile_id:page,scopes:['pages_manage_posts','pages_read_engagement'],expires_at:Date.now()/1000+3600};
test('permission validation rejects missing, expired, wrong Page and granular-target grants',()=>{
 assert.ok(validPagePermission(validToken,page));
 for(const change of [{is_valid:false},{type:'USER'},{profile_id:'987'},{scopes:[]},{expires_at:1},{data_access_expires_at:1},{granular_scopes:[{scope:'pages_manage_posts',target_ids:['987']}]}])assert.equal(validPagePermission({...validToken,...change},page),false);
});
test('preflight never sends a write; missing scopes block it and error output is sanitized',async()=>{
 const calls:RequestInit[]=[];
 const fake=(async(_url,init)=>{calls.push(init??{});return Response.json({data:{...validToken,scopes:[]}});}) as typeof fetch;
 await assert.rejects(validateNewsPage(page,fake,async()=>token),(e:unknown)=>e instanceof NewsGraphError&&e.disposition==='blocked'&&!e.message.includes(token));
 assert.ok(calls.every(c=>!c.method||c.method==='GET'));
});
test('Graph success stores an ID, rate rejection retries, ambiguous transport/server outcomes never retry',async()=>{
 const auth={pageId:page,token};let calls=0;
 const success=(async(_url,init)=>{calls++;assert.equal(new Headers(init?.headers).get('Authorization'),`Bearer ${token}`);assert.ok(!String(init?.body).includes(token));return Response.json({id:'123_456'});}) as typeof fetch;
 assert.equal(await sendNewsPost(auth,'خبر عربي',success),'123_456');assert.equal(calls,1);
 const cases:Array<[typeof fetch,string]>=[
  [(async()=>{throw new Error('network '+token);}) as typeof fetch,'uncertain'],
  [(async()=>Response.json({error:{code:2}},{status:503})) as typeof fetch,'uncertain'],
  [(async()=>Response.json({success:true})) as typeof fetch,'uncertain'],
  [(async()=>Response.json({error:{code:4,message:token}},{status:400})) as typeof fetch,'retry'],
  [(async()=>Response.json({error:{code:190,message:token}},{status:400})) as typeof fetch,'blocked'],
 ];
 for(const [fetcher,disposition] of cases)await assert.rejects(sendNewsPost(auth,'خبر',fetcher),(e:unknown)=>e instanceof NewsGraphError&&e.disposition===disposition&&!e.message.includes(token));
 await assert.rejects(reconcileNewsPost(auth,'999_456','خبر',success),/POST_PAGE_MISMATCH/);
 await assert.rejects(reconcileNewsPost(auth,'123_456','خبر',(async()=>Response.json({id:'123_456',message:'محتوى مختلف'})) as typeof fetch),/RECONCILIATION_MISMATCH/);
});

test('Postgres leases, durable send marker, unique stories, Riyadh quota and pause survive restarts',async()=>{
 const pg=new PGlite(),dialect=new PgDialect();
 const query=async(s:SQL)=>{const q=dialect.sqlToQuery(s);return pg.query(q.sql,q.params);};
 try{
  await pg.exec('CREATE TABLE settings(key text PRIMARY KEY,value text NOT NULL,updated_at timestamptz DEFAULT now()); CREATE TABLE users(id uuid PRIMARY KEY,is_active boolean,role text); CREATE TABLE facebook_pages(id uuid PRIMARY KEY,platform text,is_active boolean,status text);');
  await pg.exec(await readFile(new URL('../drizzle/0025_elon_news.sql',import.meta.url),'utf8'));
  const owner='00000000-0000-4000-8000-000000000001',pageId='00000000-0000-4000-8000-000000000002';
  const config={monitoring:true,autoPublish:true,ownerId:owner,revision:'r1',pageId,sourceIds:['aitnews']};
  await pg.query('INSERT INTO users VALUES($1,true,\'admin\')',[owner]);
  await pg.query('INSERT INTO facebook_pages VALUES($1,\'facebook\',true,\'active\')',[pageId]);
  await pg.query('INSERT INTO settings(key,value) VALUES(\'elon_news_config\',$1),(\'elon_news_runtime\',\'{}\')',[JSON.stringify(config)]);
  assert.equal((await query(claimRunQuery('first'))).rows.length,1);
  assert.equal((await query(claimRunQuery('concurrent'))).rows.length,0);
  const jobs:string[]=[];
  for(let i=0;i<8;i++){
   const s=await pg.query<{id:string}>('INSERT INTO elon_news_stories(fingerprint,title,status,arabic_post,published_at,verification) VALUES($1,\'title\',\'verified\',\'منشور عربي\',now(),\'{"policy":"human_review"}\') RETURNING id',['fingerprint-'+i]);
   await pg.query('INSERT INTO elon_news_reports(story_id,url,source_id,independence_group,title,excerpt,sha256) VALUES($1,$2,\'aitnews\',\'aitnews\',\'test\',\'test\',\'hash\')',[s.rows[0].id,'https://aitnews.com/test-'+i]);
   const p=await pg.query<{id:string}>('INSERT INTO elon_news_publications(story_id,page_id) VALUES($1,$2) RETURNING id',[s.rows[0].id,pageId]);jobs.push(p.rows[0].id);
   const again=await pg.query('INSERT INTO elon_news_publications(story_id,page_id) VALUES($1,$2) ON CONFLICT(story_id) DO NOTHING RETURNING id',[s.rows[0].id,pageId]);assert.equal(again.rows.length,0);
  }
  const begin=(id:string,limit=5,gap=10,revision='r1',token='first')=>query(beginSendQuery({id,token,revision,pageId,limit,gap}));
  assert.equal((await begin(jobs[0])).rows.length,1);
  assert.equal((await begin(jobs[0])).rows.length,0,'durable marker blocks retry even before a response is stored');
  assert.equal((await begin(jobs[1])).rows.length,0,'minimum interval cannot be bypassed by breaking news');
  await pg.query('UPDATE elon_news_publications SET status=\'uncertain\' WHERE id=$1',[jobs[0]]);
  // Unknown outcomes remain in quota, and never return to a sendable status.
  assert.equal((await begin(jobs[0])).rows.length,0);
  assert.equal((await begin(jobs[1],1,0)).rows.length,0);
  assert.equal((await begin(jobs[1],5,0,'changed-revision')).rows.length,0);
  await pg.query('UPDATE settings SET value=$1 WHERE key=\'elon_news_config\'',[JSON.stringify({...config,autoPublish:false})]);
  assert.equal((await begin(jobs[1],5,0)).rows.length,0,'policy pause rechecked immediately before POST');
  await pg.query('UPDATE settings SET value=$1 WHERE key=\'elon_news_config\'',[JSON.stringify(config)]);
  await pg.query('UPDATE settings SET value=$1 WHERE key=\'elon_news_config\'',[JSON.stringify({...config,sourceIds:[]})]);
  assert.equal((await begin(jobs[1],5,0)).rows.length,0,'withdrawn source approval blocks an already verified story');
  await pg.query('UPDATE settings SET value=$1 WHERE key=\'elon_news_config\'',[JSON.stringify(config)]);
  await pg.exec('UPDATE settings SET value=\'{}\' WHERE key=\'elon_news_runtime\';');
  assert.equal((await query(claimRunQuery('restart'))).rows.length,1);
  assert.equal((await begin(jobs[1],5,0,'r1','first')).rows.length,0,'stale lease cannot send after restart');
  assert.equal((await begin(jobs[1],5,0,'r1','restart')).rows.length,1);
  await pg.exec('UPDATE users SET is_active=false;');
  await pg.exec("UPDATE elon_news_publications SET reserved_at=now()-interval '20 minutes' WHERE reserved_at IS NOT NULL");
  assert.equal((await begin(jobs[2],5,10,'r1','restart')).rows.length,0,'inactive policy owner cannot send');
  await pg.exec('UPDATE users SET is_active=true;');
  // Model yesterday's possible sends without changing their terminal statuses.
  await pg.exec("UPDATE elon_news_publications SET reserved_at=((date_trunc('day',now() AT TIME ZONE 'Asia/Riyadh')-interval '1 minute') AT TIME ZONE 'Asia/Riyadh') WHERE reserved_at IS NOT NULL");
  for(const id of jobs.slice(2,7))assert.equal((await begin(id,5,0,'r1','restart')).rows.length,1);
  assert.equal((await begin(jobs[7],5,0,'r1','restart')).rows.length,0,'sixth possible send is refused on the Riyadh day');
 }finally{await pg.close();}
});
