import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { messengerConversationLookup,messengerPageScope } from '../src/services/messenger-access';
import { assertDisposableDatabase } from './database-safety';

test('conversation scope is bound inside lookup before messages and read mutation',()=>{
  const id=randomUUID(),page=randomUUID();
  const query=new PgDialect().sqlToQuery(messengerConversationLookup(id,new Set([page])));
  assert.match(query.sql,/where c.id=\$\d+::uuid and c.page_id in/);
  assert.ok(query.params.includes(id));assert.ok(query.params.includes(page));assert.equal(query.sql.includes(page),false);
  assert.match(new PgDialect().sqlToQuery(messengerPageScope(new Set())).sql,/false/);
  assert.match(new PgDialect().sqlToQuery(messengerPageScope(null)).sql,/true/);
});
test('isolated denied detail leaves unread untouched, authorized preflight is side-effect free',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  assertDisposableDatabase(process.env.TEST_DATABASE_URL,process.env.DISPOSABLE_TEST_DATABASE_HOST,process.env.DATABASE_URL);
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
