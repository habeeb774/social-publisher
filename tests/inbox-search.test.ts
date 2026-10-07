import test from 'node:test';
import assert from 'node:assert/strict';
import {PgDialect} from 'drizzle-orm/pg-core';
import {inboxSearchQuery} from '../src/services/inbox-search';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {NextRequest} from 'next/server';
import {assertDisposableDatabase} from './database-safety';

test('inbox discovery binds scope before ordering and limits, returning names not message bodies',()=>{
  const page='00000000-0000-4000-8000-000000000001';
  for(const kind of ['messenger','comments'] as const){
    const {sql,params}=new PgDialect().sqlToQuery(inboxSearchQuery(kind,'price%_\\',new Set([page])));
    assert.match(sql,/where c.page_id in/);assert.match(sql,/limit 5/);
    assert.ok(params.includes(page));assert.equal(sql.includes(page),false);
    assert.ok(params.includes('%price\\%\\_\\\\%'));
    assert.doesNotMatch(sql.split('from')[0],/last_message|c.message|email|contact|token/);
    assert.match(new PgDialect().sqlToQuery(inboxSearchQuery(kind,'test',new Set())).sql,/where false/);
    assert.match(new PgDialect().sqlToQuery(inboxSearchQuery(kind,'test',null)).sql,/where true/);
  }
});

test('global inbox discovery returns only authorized names through the real API handler',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  assertDisposableDatabase(process.env.TEST_DATABASE_URL,process.env.DISPOSABLE_TEST_DATABASE_HOST,process.env.DATABASE_URL);
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  const previousSecret=process.env.AUTH_SECRET;process.env.AUTH_SECRET=randomUUID();
  try{
    const {getDb}=await import('../src/db');const db=getDb();
    const own=randomUUID(),outside=randomUUID(),marker=`inbox-search-${randomUUID()}`;
    for(const page of [own,outside]){
      await db.execute(sql`insert into facebook_pages(id,name,facebook_page_id) values(${page}::uuid,'Discovery QA',${`qa-${page}`})`);
      const hidden=page===outside,person=hidden?'Synthetic hidden person':'Synthetic visible person';
      await db.execute(sql`insert into messenger_conversations(page_id,facebook_conversation_id,participant_name,last_message,last_message_at) values(${page}::uuid,${`qa-conv-${page}`},${person},${marker},now())`);
      await db.execute(sql`insert into facebook_comments(page_id,facebook_comment_id,author_name,message,created_time) values(${page}::uuid,${`qa-comment-${page}`},${person},${marker},now())`);
    }
    for(const kind of ['messenger','comments'] as const){
      const scoped=(await db.execute(inboxSearchQuery(kind,marker,new Set([own])))).rows;
      assert.equal(scoped.length,1);assert.equal(scoped[0].text,'Synthetic visible person');assert.deepEqual(Object.keys(scoped[0]).sort(),['id','text']);
      assert.equal((await db.execute(inboxSearchQuery(kind,marker,new Set()))).rows.length,0);
      assert.equal((await db.execute(inboxSearchQuery(kind,marker,null))).rows.length,2);
    }
    const {createSessionToken,SESSION_COOKIE}=await import('../src/services/request-auth');
    const {setUserAccessScope}=await import('../src/services/access-scope');
    const {GET}=await import('../src/app/api/search/route');
    const id=randomUUID();await db.execute(sql`insert into users(id,email,role) values(${id}::uuid,${`discovery-${id}@example.invalid`},'viewer')`);
    await setUserAccessScope(id,{unrestricted:false,accountIds:[],pageIds:[own]});
    const request=new NextRequest(`http://localhost/api/search?q=${marker}`,{headers:{cookie:`${SESSION_COOKIE}=${await createSessionToken({userId:id,role:'admin'})}`}});
    const response=await GET(request);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
    const body=await response.json();assert.equal(body.results.length,2);
    assert.deepEqual(body.results.map((row:{type:string})=>row.type),['محادثة','تعليق']);
    for(const row of body.results){assert.equal(row.label,'Synthetic visible person');assert.ok(row.href.includes(`q=${marker}`));}
    assert.equal(JSON.stringify(body).includes('Synthetic hidden person'),false);
    await setUserAccessScope(id,{unrestricted:false,accountIds:[],pageIds:[]});
    assert.deepEqual((await (await GET(request)).json()).results,[]);
  }finally{if(previousSecret===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=previousSecret;}
});
