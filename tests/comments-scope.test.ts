import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {assertDisposableDatabase} from './database-safety';

test('comment scope precedes pagination even when newer hidden comments fill the page',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  assertDisposableDatabase(process.env.TEST_DATABASE_URL,process.env.DISPOSABLE_TEST_DATABASE_HOST,process.env.DATABASE_URL);
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  const {getDb}=await import('../src/db');const db=getDb();
  const {inbox}=await import('../src/services/comments/store');
  const own=randomUUID(),outside=randomUUID(),visible=randomUUID(),marker=`comments-scope-${randomUUID()}`;
  for(const page of [own,outside])await db.execute(sql`insert into facebook_pages(id,name,facebook_page_id) values(${page}::uuid,'Comment scope QA',${`qa-${page}`})`);
  await db.execute(sql`insert into facebook_comments(id,page_id,facebook_comment_id,message,created_time) values(${visible}::uuid,${own}::uuid,${`qa-${visible}`},${marker},now()-interval '1 day')`);
  await db.execute(sql`insert into facebook_comments(page_id,facebook_comment_id,message,created_time)
    select ${outside}::uuid,${marker}||'-'||n::text,${marker},now()+n*interval '1 second' from generate_series(1,55) n`);
  const params=new URLSearchParams({q:marker,status:'all'});
  const scoped=await inbox(params,new Set([own]));
  assert.deepEqual(scoped.items.map(row=>row.id),[visible]);assert.equal(scoped.nextCursor,null);
  assert.deepEqual((await inbox(params,new Set())).items,[]);
  assert.deepEqual((await inbox(params)).items,[],'omitted scope fails closed');
  const unrestricted=await inbox(params,null);assert.equal(unrestricted.items.length,50);assert.ok(unrestricted.nextCursor);
  const second=await inbox(new URLSearchParams({q:marker,status:'all',cursor:unrestricted.nextCursor!}),null);
  assert.equal(second.items.length,6);assert.equal(second.nextCursor,null);assert.ok(second.items.some(row=>row.id===visible));
});
