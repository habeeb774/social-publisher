import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { leadBulkStageSchema, leadBulkStageQuery } from '../src/services/leads-bulk';
import { assertDisposableDatabase } from './database-safety';

const id='8a79eb88-d269-44de-bee6-243ca0391432',version='2026-10-07T10:00:00.123456Z';
test('bulk validation limits input, rejects duplicate IDs regardless of case and invalid stages/versions',()=>{
  const item={id,expectedUpdatedAt:version};
  assert.equal(leadBulkStageSchema.safeParse({status:'won',leads:[item]}).success,true);
  for(const input of [{status:'unknown',leads:[item]},{status:'won',leads:[]},{status:'won',leads:Array(51).fill(item)},{status:'won',leads:[item,{...item,id:id.toUpperCase()}]},{status:'won',leads:[{...item,expectedUpdatedAt:'bad'}]},{status:'won',leads:[item],extra:true}])assert.equal(leadBulkStageSchema.safeParse(input).success,false);
});
test('bulk SQL binds input and scope, orders locks, gates the entire batch and couples audit to changes',()=>{
  const query=new PgDialect().sqlToQuery(leadBulkStageQuery(leadBulkStageSchema.parse({status:'won',leads:[{id,expectedUpdatedAt:version}]}),new Set([id]),'qa@example.test'));
  assert.match(query.sql,/order by l.id for update of l/);assert.match(query.sql,/bool_and\(updated_at=version\)/);assert.match(query.sql,/where d.permitted/);assert.match(query.sql,/from changed returning id/);
  for(const value of [id,version,'won','qa@example.test'])assert.ok(query.params.includes(value));
  assert.equal(query.sql.includes('qa@example.test'),false);
});
test('isolated bulk updates are atomic for stale/outside input and overlapping requests', {skip:!process.env.TEST_DATABASE_URL}, async()=>{
  assertDisposableDatabase(process.env.TEST_DATABASE_URL,process.env.DISPOSABLE_TEST_DATABASE_HOST,process.env.DATABASE_URL);
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  const {getDb}=await import('../src/db');const db=getDb();
  const page=randomUUID(),outside=randomUUID(),first=randomUUID(),second=randomUUID(),hidden=randomUUID();
  for(const target of [page,outside])await db.execute(sql`insert into facebook_pages(id,name,facebook_page_id) values(${target}::uuid,'Bulk QA',${`qa-${target}`})`);
  for(const [lead,target] of [[first,page],[second,page],[hidden,outside]])await db.execute(sql`insert into leads(id,page_id,name) values(${lead}::uuid,${target}::uuid,'Bulk QA synthetic')`);
  const snapshot=async()=> (await db.execute(sql`select id,status,updated_at::text as version from leads where id in (${first}::uuid,${second}::uuid,${hidden}::uuid) order by id`)).rows;
  const before=await snapshot();
  const item=(target:string)=>({id:target,expectedUpdatedAt:String(before.find(row=>row.id===target)!.version)});
  const execute=async(leads:ReturnType<typeof item>[],status:'won'|'lost'='won')=>(await db.execute(leadBulkStageQuery(leadBulkStageSchema.parse({leads,status}),new Set([page]),'bulk-qa@example.test'))).rows[0];
  assert.equal((await execute([item(first),item(hidden)])).changed,0);assert.deepEqual(await snapshot(),before);
  assert.equal((await execute([item(first),{...item(second),expectedUpdatedAt:version}])).changed,0);assert.deepEqual(await snapshot(),before);
  const concurrent=await Promise.all([execute([item(first),item(second)],'won'),execute([item(second),item(first)],'lost')]);
  assert.deepEqual(concurrent.map(row=>row.changed).sort(),[0,2]);assert.deepEqual(concurrent.map(row=>row.audited).sort(),[0,2]);
  const after=await snapshot();assert.equal(after.find(row=>row.id===hidden)!.status,'new');assert.equal(after.find(row=>row.id===first)!.status,after.find(row=>row.id===second)!.status);
  assert.equal((await execute([item(first),item(second)])).changed,0);
  const audits=await db.execute(sql`select metadata from activity_logs where entity_id in (${first}::uuid,${second}::uuid,${hidden}::uuid)`);
  assert.equal(audits.rows.length,2);for(const row of audits.rows)assert.equal((row.metadata as {bulk:boolean}).bulk,true);
});
