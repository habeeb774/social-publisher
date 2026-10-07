import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { messengerConversationLookup,messengerPageScope } from '../src/services/messenger-access';
import { assertDisposableDatabase } from './database-safety';
const applicationDatabaseUrl=process.env.DATABASE_URL;

test('conversation scope is bound inside lookup before messages and read mutation',()=>{
  const id=randomUUID(),page=randomUUID();
  const query=new PgDialect().sqlToQuery(messengerConversationLookup(id,new Set([page])));
  assert.match(query.sql,/where c.id=\$\d+::uuid and c.page_id in/);
  assert.ok(query.params.includes(id));assert.ok(query.params.includes(page));assert.equal(query.sql.includes(page),false);
  assert.match(new PgDialect().sqlToQuery(messengerPageScope(new Set())).sql,/false/);
  assert.match(new PgDialect().sqlToQuery(messengerPageScope(null)).sql,/true/);
});
test('isolated denied detail leaves unread untouched, authorized preflight is side-effect free',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  assertDisposableDatabase(process.env.TEST_DATABASE_URL,process.env.DISPOSABLE_TEST_DATABASE_HOST,applicationDatabaseUrl);
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  const {getDb}=await import('../src/db');const db=getDb();
  const {conversationDetail,listConversations}=await import('../src/services/messenger');
  const own=randomUUID(),outside=randomUUID(),visible=randomUUID(),hidden=randomUUID();
  const name=`messenger-access-${randomUUID()}`;
  for(const page of [own,outside])await db.execute(sql`insert into facebook_pages(id,name,facebook_page_id) values(${page}::uuid,'Messenger QA',${`qa-${page}`})`);
  for(const [id,page] of [[visible,own],[hidden,outside]]){
    await db.execute(sql`insert into messenger_conversations(id,page_id,facebook_conversation_id,participant_name,last_message,last_message_at) values(${id}::uuid,${page}::uuid,${`qa-${id}`},${name},'synthetic preview',now())`);
    await db.execute(sql`insert into messenger_messages(conversation_id,facebook_message_id,message,created_time) values(${id}::uuid,${`qa-message-${id}`},'synthetic private message',now())`);
  }
  const unread=async(id:string)=>(await db.execute(sql`select unread from messenger_conversations where id=${id}::uuid`)).rows[0].unread;
  await assert.rejects(conversationDetail(hidden,new Set([own])),/CONVERSATION_NOT_FOUND/);
  await assert.rejects(conversationDetail(visible,new Set()),/CONVERSATION_NOT_FOUND/);
  assert.equal(await unread(hidden),true);assert.equal(await unread(visible),true);
  const preflight=await conversationDetail(visible,new Set([own]),{markRead:false,includeMessages:false});
  assert.equal(preflight.conversation.id,visible);assert.deepEqual(preflight.messages,[]);assert.equal(await unread(visible),true);
  const detail=await conversationDetail(visible,new Set([own]));
  assert.equal(detail.messages.length,1);assert.equal(await unread(visible),false);assert.equal(await unread(hidden),true);
  const admin=await conversationDetail(hidden,null,{markRead:false});assert.equal(admin.messages.length,1);assert.equal(await unread(hidden),true);
  const listed=await listConversations('','',name,'all',new Set([own]));assert.deepEqual(listed.map(row=>(row as Record<string,unknown>).id),[visible]);
  assert.deepEqual(await listConversations('','',name,'all',new Set()),[]);
  assert.deepEqual(await listConversations('','',name,'all'),[],'omitted scope must fail closed');
});

test('Messenger state filtering precedes the cap and new unread messages reopen archived threads',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  assertDisposableDatabase(process.env.TEST_DATABASE_URL,process.env.DISPOSABLE_TEST_DATABASE_HOST,applicationDatabaseUrl);
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  const {getDb}=await import('../src/db');const db=getDb();
  const {listConversations}=await import('../src/services/messenger');
  const page=randomUUID(),name=`messenger-filter-${randomUUID()}`;
  await db.execute(sql`insert into facebook_pages(id,name,facebook_page_id) values(${page}::uuid,'Filter QA',${`qa-${page}`})`);
  await db.execute(sql`insert into messenger_conversations(page_id,facebook_conversation_id,participant_name,last_message_at,unread)
    select ${page}::uuid,${name}||n::text,${name},now(),false from generate_series(1,101) n`);
  await db.execute(sql`insert into activity_logs(action,entity_type,entity_id,created_at)
    select 'messenger.archived','messenger_conversation',id,now()+interval '1 minute' from messenger_conversations where page_id=${page}::uuid`);
  const active=randomUUID(),reopened=randomUUID();
  await db.execute(sql`insert into messenger_conversations(id,page_id,facebook_conversation_id,participant_name,last_message_at,unread)
    values(${active}::uuid,${page}::uuid,${`qa-${active}`},${name},now()-interval '1 day',true),
      (${reopened}::uuid,${page}::uuid,${`qa-${reopened}`},${name},now()-interval '2 days',true)`);
  await db.execute(sql`insert into activity_logs(action,entity_type,entity_id,created_at) values('messenger.archived','messenger_conversation',${reopened}::uuid,now()-interval '3 days')`);
  const scope=new Set([page]);
  const activeRows=await listConversations('','',name,'active',scope);
  assert.deepEqual(activeRows.map(row=>(row as Record<string,unknown>).id),[active,reopened]);
  assert.ok(activeRows.every(row=>row.state==='open'));
  const unread=await listConversations('','',name,'unread',scope);
  assert.deepEqual(unread.map(row=>(row as Record<string,unknown>).id),[active,reopened]);
  const archived=await listConversations('','',name,'archived',scope);
  assert.equal(archived.length,100);assert.ok(archived.every(row=>row.state==='archived'));
  assert.deepEqual(await listConversations('','',name,'unread',new Set()),[]);
});
