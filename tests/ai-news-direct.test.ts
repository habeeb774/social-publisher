import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {PgDialect} from 'drizzle-orm/pg-core';
import {beginSendQuery,claimRunQuery} from '../src/services/ai-news/queries';
import {configSchema,DEFAULT_CONFIG} from '../src/services/ai-news/model';

test('direct publishing is explicit and legacy configs retain corroboration',()=>{
 const {verificationMode,...legacy}=DEFAULT_CONFIG;
 assert.equal(verificationMode,'corroborated');
 assert.equal(configSchema.parse(legacy).verificationMode,'corroborated');
 assert.equal(configSchema.parse({...legacy,verificationMode:'approved_source'}).verificationMode,'approved_source');
 assert.equal(configSchema.safeParse({...legacy,verificationMode:'unchecked_any_url'}).success,false);
});

test('direct source policy sends once, rechecks current approval and does not bypass quotas',async()=>{
 const pg=new PGlite(),dialect=new PgDialect();
 const owner='00000000-0000-4000-8000-000000000001',pageId='00000000-0000-4000-8000-000000000002';
 const config={...DEFAULT_CONFIG,monitoring:true,autoPublish:true,ownerId:owner,revision:'direct',pageId,sourceIds:['openai'],verificationMode:'approved_source'};
 const save=async(value:object)=>pg.query("UPDATE settings SET value=$1 WHERE key='ai_news_config'",[JSON.stringify(value)]);
 try{
  await pg.exec('CREATE TABLE settings(key text PRIMARY KEY,value text NOT NULL,updated_at timestamptz DEFAULT now()); CREATE TABLE users(id uuid PRIMARY KEY,is_active boolean,role text); CREATE TABLE facebook_pages(id uuid PRIMARY KEY,platform text,is_active boolean,status text);');
  await pg.exec(await readFile(new URL('../drizzle/0026_ai_news.sql',import.meta.url),'utf8'));
  await pg.query("INSERT INTO users VALUES($1,true,'admin')",[owner]);
  await pg.query("INSERT INTO facebook_pages VALUES($1,'facebook',true,'active')",[pageId]);
  await pg.query("INSERT INTO settings(key,value) VALUES('ai_news_config',$1),('ai_news_runtime','{}')",[JSON.stringify(config)]);
  const lease=dialect.sqlToQuery(claimRunQuery('worker'));await pg.query(lease.sql,lease.params);
  const jobs:string[]=[];
  for(let i=0;i<2;i++){
   const s=await pg.query<{id:string}>(`INSERT INTO ai_news_stories(fingerprint,title,status,arabic_post,published_at,verification) VALUES($1,'AI title','verified','خبر بالعربية',now(),'{"policy":"approved_source_direct_v1"}') RETURNING id`,['direct-'+i]);
   await pg.query("INSERT INTO ai_news_reports(story_id,url,source_id,independence_group,title,excerpt,sha256) VALUES($1,$2,'openai','openai','title','','hash')",[s.rows[0].id,'https://openai.com/direct-'+i]);
   const p=await pg.query<{id:string}>('INSERT INTO ai_news_publications(story_id,page_id) VALUES($1,$2) RETURNING id',[s.rows[0].id,pageId]);jobs.push(p.rows[0].id);
  }
  const send=async(id:string,limit=5,gap=0)=>{const q=dialect.sqlToQuery(beginSendQuery({id,token:'worker',revision:'direct',pageId,limit,gap}));return pg.query(q.sql,q.params);};
  await save({...config,verificationMode:'corroborated'});
  assert.equal((await send(jobs[0])).rows.length,0,'reverting policy blocks direct-only stories');
  await save({...config,sourceIds:[]});
  assert.equal((await send(jobs[0])).rows.length,0,'withdrawn source cannot send');
  await save({...config,autoPublish:false});
  assert.equal((await send(jobs[0])).rows.length,0,'pause remains authoritative');
  await save(config);
  assert.equal((await send(jobs[0])).rows.length,1,'one approved source is sufficient in explicit direct mode');
  assert.equal((await send(jobs[0])).rows.length,0,'durable reservation prevents repeat');
  assert.equal((await send(jobs[1],1)).rows.length,0,'daily limit survives direct mode');
  assert.equal((await send(jobs[1],5,10)).rows.length,0,'minimum interval survives direct mode');
 }finally{await pg.close();}
});
