import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {NextRequest} from 'next/server';
import {assertDisposableDatabase} from './database-safety';

test('comment scope precedes pagination even when newer hidden comments fill the page',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  assertDisposableDatabase(process.env.TEST_DATABASE_URL,process.env.DISPOSABLE_TEST_DATABASE_HOST,process.env.DATABASE_URL);
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  const {getDb}=await import('../src/db');const db=getDb();
  const {inbox,commentAccess,commentDetail}=await import('../src/services/comments/store');
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
  const hidden=String(unrestricted.items[0].id);
  await assert.rejects(commentDetail(hidden,new Set([own])),/COMMENT_NOT_FOUND/);
  await assert.rejects(commentAccess(hidden,new Set([own])),/COMMENT_NOT_FOUND/);
  await assert.rejects(commentAccess(visible),/COMMENT_NOT_FOUND/,'omitted scope fails closed');
  await assert.rejects(commentDetail(visible,new Set()),/COMMENT_NOT_FOUND/);
  assert.equal((await commentAccess(visible,new Set([own]))).id,visible);
  const ownChild=randomUUID(),outsideChild=randomUUID();
  for(const [id,page] of [[ownChild,own],[outsideChild,outside]])await db.execute(sql`insert into facebook_comments(id,page_id,facebook_comment_id,parent_facebook_comment_id,message,created_time)
    values(${id}::uuid,${page}::uuid,${`qa-${id}`},${`qa-${visible}`},'Synthetic child comment',now())`);
  const detail=await commentDetail(visible,new Set([own]));
  assert.deepEqual(detail.thread.map(row=>row.id),[ownChild],'thread linkage cannot expose another Page');
  assert.equal((await commentDetail(hidden,null)).comment.id,hidden);
  const previousSecret=process.env.AUTH_SECRET;process.env.AUTH_SECRET=randomUUID();
  try{
    const {createSessionToken,SESSION_COOKIE}=await import('../src/services/request-auth');
    const {setUserAccessScope}=await import('../src/services/access-scope');
    const {GET,POST}=await import('../src/app/api/comments/route');
    const userId=randomUUID();
    await db.execute(sql`insert into users(id,email,role) values(${userId}::uuid,${`scope-${userId}@example.invalid`},'editor')`);
    await setUserAccessScope(userId,{unrestricted:false,pageIds:[own],accountIds:[]});
    const cookie=`${SESSION_COOKIE}=${await createSessionToken({userId,role:'admin'})}`;
    const denied=await GET(new NextRequest(`http://localhost/api/comments?id=${hidden}`,{headers:{cookie}}));
    assert.equal(denied.status,404);assert.equal(JSON.stringify(await denied.json()).includes(marker),false);
    const accepted=await GET(new NextRequest(`http://localhost/api/comments?id=${visible}`,{headers:{cookie}}));
    assert.equal(accepted.status,200);assert.equal(accepted.headers.get('cache-control'),'private, no-store');
    assert.equal((await accepted.json()).comment.id,visible);
    const reply={action:'send',id:hidden,replyId:randomUUID()};
    const blocked=await POST(new NextRequest('http://localhost/api/comments',{method:'POST',headers:{cookie,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(reply)}));
    assert.equal(blocked.status,404,'scope gate blocks external reply before any Meta call');
    await db.execute(sql`update users set role='viewer' where id=${userId}::uuid`);
    const readonly=await POST(new NextRequest('http://localhost/api/comments',{method:'POST',headers:{cookie,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(reply)}));
    assert.equal(readonly.status,403,'stale admin cookie does not allow sending');
  }finally{if(previousSecret===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=previousSecret;}
});
