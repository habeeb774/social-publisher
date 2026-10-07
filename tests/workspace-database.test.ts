import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { assertDisposableDatabase } from "./database-safety";
import { workspaceMembershipQuery, workspacePagesQuery } from "../src/services/workspace-access";
import { NextRequest } from "next/server";
import { authorizeWorkspace, createWorkspaceAccessHandler } from "../src/services/workspace-request";
import { createWorkspacePostListHandler, workspacePostListQuery, workspacePostEditPredicate, workspacePostCreateQuery, workspacePostDuplicateQuery } from "../src/services/workspace-posts";
import { and, eq } from "drizzle-orm";
import { posts } from "../src/db/schema";

const testUrl = process.env.TEST_DATABASE_URL;
test("workspace foundation on explicitly disposable database", {skip:!testUrl && "TEST_DATABASE_URL not set"}, async t => {
  assertDisposableDatabase(testUrl, process.env.DISPOSABLE_TEST_DATABASE_HOST, process.env.DATABASE_URL);
  assert.ok(testUrl);
  const connection = neon(testUrl);
  const [existing] = await connection`SELECT to_regclass('public.workspaces') AS relation`;
  if (!existing.relation) {
    const migration = await readFile(new URL("../drizzle/0017_workspace_foundation.sql", import.meta.url), "utf8");
    await connection.transaction(migration.split(";").map(s => s.trim()).filter(Boolean).map(s => connection.query(s)));
  }
  process.env.DATABASE_URL = testUrl;
  const { getDb } = await import("../src/db");
  const db = getDb();
  const a = randomUUID(), b = randomUUID(), member = randomUUID(), outsider = randomUUID(), pageA = randomUUID(), pageB = randomUUID();
  await connection`INSERT INTO workspaces(id,name) VALUES(${a},'QA A'),(${b},'QA B')`;
  await connection`INSERT INTO users(id,email,role) VALUES(${member},${`${member}@example.test`},'viewer'),(${outsider},${`${outsider}@example.test`},'admin')`;
  await connection`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${a},${member},'support')`;
  await connection`INSERT INTO facebook_pages(id,name,facebook_page_id) VALUES(${pageA},'QA A',${`qa-${pageA}`}),(${pageB},'QA B',${`qa-${pageB}`})`;
  await connection`INSERT INTO workspace_pages(workspace_id,page_id) VALUES(${a},${pageA}),(${b},${pageB})`;
  const membership = (user=member, workspace=a) => db.execute(workspaceMembershipQuery(user,workspace));
  const pages = (user=member, workspace=a) => db.execute(workspacePagesQuery(user,workspace));

  await t.test("signed sessions use real database membership and current tenant role", async () => {
    const previousSecret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = randomUUID();
    try {
      const { currentUser } = await import("../src/services/rbac");
      const { createSessionToken } = await import("../src/services/request-auth");
      const dependencies = {user:currentUser,membership:async(userId:string,workspaceId:string)=>(await db.execute(workspaceMembershipQuery(userId,workspaceId))).rows};
      const handler = createWorkspaceAccessHandler(dependencies);
      const token = await createSessionToken({userId:member,role:"viewer"});
      const adminToken = await createSessionToken({userId:outsider,role:"admin"});
      const request = (cookie=token) => new NextRequest(`https://qa.example.test/api/workspaces/${a}/access`,{headers:{cookie:`sp_admin=${cookie}`,"x-workspace-role":"owner"}});
      assert.equal((await handler(request(),{params:Promise.resolve({id:a})})).status,200);
      assert.equal((await handler(request(),{params:Promise.resolve({id:b})})).status,403);
      assert.equal((await handler(request(adminToken),{params:Promise.resolve({id:a})})).status,403);
      assert.equal((await handler(request("forged"),{params:Promise.resolve({id:a})})).status,401);
      const { GET:postList } = await import("../src/app/api/posts/route");
      const postsRequest=(workspace:string|null)=>new NextRequest(`https://qa.example.test/api/posts${workspace?`?workspace=${workspace}`:''}`,{headers:{cookie:`sp_admin=${token}`}});
      assert.equal((await postList(postsRequest(a))).status,200);
      assert.equal((await postList(postsRequest(b))).status,403);
      const previousFlag=process.env.WORKSPACE_ISOLATION_ENABLED;
      process.env.WORKSPACE_ISOLATION_ENABLED="true";
      try { assert.equal((await postList(postsRequest(null))).status,400); }
      finally { if(previousFlag===undefined)delete process.env.WORKSPACE_ISOLATION_ENABLED;else process.env.WORKSPACE_ISOLATION_ENABLED=previousFlag; }
      assert.ok((await authorizeWorkspace(request(),a,dependencies,"messages.reply")).context);
      await connection`UPDATE workspace_members SET role='viewer' WHERE workspace_id=${a} AND user_id=${member}`;
      assert.equal((await authorizeWorkspace(request(),a,dependencies,"messages.reply")).response?.status,403);
      await connection`UPDATE workspace_members SET role='support' WHERE workspace_id=${a} AND user_id=${member}`;
    } finally {
      if (previousSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET=previousSecret;
    }
  });

  await t.test("only actual membership grants access, not a global administrator role", async () => {
    assert.equal((await membership()).rows[0].role, "support");
    assert.deepEqual((await pages()).rows.map(r => r.id), [pageA]);
    for (const [user,workspace] of [[member,b],[outsider,a],[outsider,b]]) {
      assert.equal((await membership(user,workspace)).rows.length,0);
      assert.equal((await pages(user,workspace)).rows.length,0);
    }
  });
  await t.test("existing posts handler path scopes before pagination and rechecks membership in SQL", async () => {
    const ownIds=Array.from({length:4},()=>randomUUID());
    for(let i=0;i<ownIds.length;i++)await connection`INSERT INTO posts(id,page_id,content,status,created_at,last_error) VALUES(${ownIds[i]},${pageA},'QA own','draft',${i===0?'2026-10-07T01:00:00.000001Z':'2026-10-07T01:00:00.000002Z'}::timestamptz,'private provider details')`;
    await connection`INSERT INTO posts(page_id,content,status,created_at) SELECT ${pageB}::uuid,'QA hidden','draft','2026-10-07T02:00:00Z'::timestamptz FROM generate_series(1,55)`;
    await connection`INSERT INTO posts(page_id,content,status,deleted_at) VALUES(${pageA},'QA deleted','draft',now())`;
    const dependencies={user:async()=>({id:member}),membership:async(userId:string,workspaceId:string)=>(await db.execute(workspaceMembershipQuery(userId,workspaceId))).rows};
    const read=async(context:Parameters<typeof workspacePostListQuery>[0],page:Parameters<typeof workspacePostListQuery>[1])=>(await db.execute(workspacePostListQuery(context,page))).rows;
    const handler=createWorkspacePostListHandler({...dependencies,read});
    const request=(cursor:string|null=null)=>new NextRequest(`https://qa.example.test/api/posts?workspace=${a}&limit=2${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
    const found:string[]=[];let cursor:string|null=null;
    do {
      const response=await handler(request(cursor),a);assert.equal(response.status,200);
      const body=await response.json();
      assert.ok(body.items.every((row:{pageId:string})=>row.pageId===pageA));
      assert.ok(!JSON.stringify(body).includes('private provider details'));
      found.push(...body.items.map((row:{id:string})=>row.id));cursor=body.nextCursor;
      assert.ok(found.length<=4);
    } while(cursor);
    assert.equal(found.length,4);assert.equal(new Set(found).size,4);
    assert.deepEqual(new Set(found),new Set(ownIds));
    assert.equal((await handler(request(),b)).status,403);
    const revoked=createWorkspacePostListHandler({...dependencies,read:async(context,page)=>{
      await connection`UPDATE workspace_members SET is_active=false WHERE workspace_id=${a} AND user_id=${member}`;
      return read(context,page);
    }});
    assert.deepEqual((await (await revoked(request(),a)).json()).items,[]);
    await connection`UPDATE workspace_members SET is_active=true WHERE workspace_id=${a} AND user_id=${member}`;
  });
  await t.test("post edits enforce tenant ownership and revoked membership in the actual update", async () => {
    const own=randomUUID(),foreign=randomUUID();
    await connection`INSERT INTO posts(id,page_id,content,status) VALUES(${own},${pageA},'QA edit','draft'),(${foreign},${pageB},'QA foreign','draft')`;
    await connection`UPDATE workspace_members SET role='editor' WHERE workspace_id=${a} AND user_id=${member}`;
    const context={userId:member,workspaceId:a,role:'owner' as const};
    const createFields={content:'QA created',status:'draft' as const,scheduledAt:null,timezone:'Asia/Riyadh' as const};
    const create=(pageId=pageA)=>db.execute(workspacePostCreateQuery(context,pageId,createFields));
    assert.equal((await create()).rows.length,1);
    assert.equal((await create(pageB)).rows.length,0);
    assert.equal((await db.execute(workspacePostCreateQuery(context,pageA,createFields,true))).rows.length,0);
    const update=(id:string)=>db.update(posts).set({content:'QA edited'}).where(and(eq(posts.id,id),workspacePostEditPredicate(context))).returning({id:posts.id});
    assert.equal((await update(own)).length,1);
    assert.equal((await update(foreign)).length,0);
    await connection`UPDATE workspace_members SET role='viewer' WHERE workspace_id=${a} AND user_id=${member}`;
    assert.equal((await update(own)).length,0);
    assert.equal((await create()).rows.length,0);
    await connection`UPDATE workspace_members SET role='editor',is_active=false WHERE workspace_id=${a} AND user_id=${member}`;
    assert.equal((await update(own)).length,0);
    assert.equal((await create()).rows.length,0);
    await connection`UPDATE workspace_members SET is_active=true WHERE workspace_id=${a} AND user_id=${member}`;
    const previousSecret=process.env.AUTH_SECRET;
    process.env.AUTH_SECRET=randomUUID();
    await connection`UPDATE users SET role='admin' WHERE id=${member}`;
    try {
      const {createSessionToken}=await import('../src/services/request-auth');
      const {PATCH}=await import('../src/app/api/posts/[id]/route');
      const {POST}=await import('../src/app/api/posts/route');
      const {POST:reschedule}=await import('../src/app/api/posts/[id]/reschedule/route');
      const {POST:publishNow}=await import('../src/app/api/posts/[id]/publish-now/route');
      const {POST:retry}=await import('../src/app/api/posts/[id]/retry/route');
      const {POST:duplicate}=await import('../src/app/api/posts/[id]/duplicate/route');
      const {POST:trash}=await import('../src/app/api/posts/[id]/trash/route');
      const token=await createSessionToken({userId:member,role:'admin'});
      const [row]=await db.select({updatedAt:posts.updatedAt}).from(posts).where(eq(posts.id,own));
      const request=(pageId=pageA,extra:Record<string,unknown>={})=>new NextRequest(`https://qa.example.test/api/posts/${own}?workspace=${a}`,{method:'PATCH',headers:{origin:'https://qa.example.test',cookie:`sp_admin=${token}`,'content-type':'application/json'},body:JSON.stringify({pageId,content:'QA route edit',status:'draft',updatedAt:row.updatedAt.toISOString(),...extra})});
      const params=(id=own)=>({params:Promise.resolve({id})});
      const createRequest=(pageId=pageA,extra:Record<string,unknown>={})=>new NextRequest(`https://qa.example.test/api/posts?workspace=${a}`,{method:'POST',headers:{origin:'https://qa.example.test',cookie:`sp_admin=${token}`,'content-type':'application/json'},body:JSON.stringify({pageId,content:'QA route create',status:'draft',...extra})});
      assert.equal((await POST(createRequest())).status,201);
      assert.equal((await POST(createRequest(pageB))).status,403);
      assert.equal((await POST(createRequest(pageA,{status:'scheduled',scheduledAt:new Date(Date.now()+3600000).toISOString()}))).status,403);
      assert.equal((await PATCH(request(pageB),params(foreign))).status,404);
      assert.equal((await PATCH(request(pageA,{status:'scheduled',scheduledAt:new Date(Date.now()+3600000).toISOString()}),params())).status,403);
      assert.equal((await PATCH(request(pageA,{campaignId:randomUUID()}),params())).status,422);
      assert.equal((await PATCH(request(),params())).status,200);
      assert.equal((await PATCH(request(),params())).status,409);
      const mutationRequest=(id:string,action:string)=>new NextRequest(`https://qa.example.test/api/posts/${id}/${action}?workspace=${a}`,{method:'POST',headers:{origin:'https://qa.example.test',cookie:`sp_admin=${token}`,'content-type':'application/json'},body:JSON.stringify({scheduledAt:new Date(Date.now()+3600000).toISOString()})});
      await connection`INSERT INTO post_media(post_id,type,url,mime_type,size) VALUES(${own},'image','https://example.test/qa.png','image/png',123)`;
      assert.equal((await duplicate(mutationRequest(foreign,'duplicate'),params(foreign))).status,404);
      const duplicated=await duplicate(mutationRequest(own,'duplicate'),params());
      assert.equal(duplicated.status,201);
      const copy=await duplicated.json();
      assert.notEqual(copy.id,own);assert.equal(copy.pageId,pageA);assert.equal(copy.content,'QA route edit');
      assert.equal(copy.status,'draft');assert.equal(copy.scheduledAt,null);assert.equal(copy.facebookPostId,null);
      assert.equal(copy.createdBy,member);
      const copiedMedia=await connection`SELECT url,mime_type,size FROM post_media WHERE post_id=${copy.id}`;
      assert.deepEqual(copiedMedia,[{url:'https://example.test/qa.png',mime_type:'image/png',size:123}]);
      await connection`UPDATE workspace_members SET role='publisher' WHERE workspace_id=${a} AND user_id=${member}`;
      assert.equal((await duplicate(mutationRequest(own,'duplicate'),params())).status,403);
      assert.equal((await db.execute(workspacePostDuplicateQuery(context,own))).rows.length,0);
      await connection`UPDATE workspace_members SET role='editor',is_active=false WHERE workspace_id=${a} AND user_id=${member}`;
      assert.equal((await db.execute(workspacePostDuplicateQuery(context,own))).rows.length,0);
      await connection`UPDATE workspace_members SET is_active=true WHERE workspace_id=${a} AND user_id=${member}`;
      await connection`UPDATE workspace_members SET role='editor' WHERE workspace_id=${a} AND user_id=${member}`;
      assert.equal((await reschedule(mutationRequest(own,'reschedule'),params())).status,403);
      assert.equal((await publishNow(mutationRequest(own,'publish-now'),params())).status,403);
      assert.equal((await retry(mutationRequest(own,'retry'),params())).status,403);
      await connection`UPDATE workspace_members SET role='manager' WHERE workspace_id=${a} AND user_id=${member}`;
      assert.equal((await reschedule(mutationRequest(foreign,'reschedule'),params(foreign))).status,409);
      assert.equal((await publishNow(mutationRequest(foreign,'publish-now'),params(foreign))).status,409);
      assert.equal((await reschedule(mutationRequest(own,'reschedule'),params())).status,200);
      await connection`UPDATE posts SET status='failed',last_error='network failure' WHERE id IN (${own},${foreign})`;
      assert.equal((await retry(mutationRequest(foreign,'retry'),params(foreign))).status,409);
      assert.equal((await retry(mutationRequest(own,'retry'),params())).status,200);
      assert.equal((await retry(mutationRequest(own,'retry'),params())).status,409);
      const [retried]=await db.select().from(posts).where(eq(posts.id,own));
      assert.equal(retried.status,'scheduled');
      assert.equal(retried.lastError,null);
      const [untouched]=await db.select().from(posts).where(eq(posts.id,foreign));
      assert.equal(untouched.status,'failed');
      await connection`UPDATE posts SET status='failed',last_error='OUTCOME_UNKNOWN' WHERE id=${own}`;
      assert.equal((await retry(mutationRequest(own,'retry'),params())).status,409);
      const confirmed=new NextRequest(`https://qa.example.test/api/posts/${own}/retry?workspace=${a}`,{method:'POST',headers:{origin:'https://qa.example.test',cookie:`sp_admin=${token}`,'content-type':'application/json'},body:JSON.stringify({confirmedNotPublished:true})});
      assert.equal((await retry(confirmed,params())).status,200);
      const trashed=randomUUID(),foreignTrash=randomUUID(),attempted=randomUUID();
      await connection`INSERT INTO posts(id,page_id,content,status,deleted_at) VALUES(${trashed},${pageA},'QA trash','draft',now()),(${foreignTrash},${pageB},'QA foreign trash','draft',now()),(${attempted},${pageA},'QA attempted','draft',now())`;
      await connection`INSERT INTO post_media(post_id,type,url) VALUES(${trashed},'image','https://example.test/qa-trash.png')`;
      await connection`INSERT INTO post_notes(post_id,body,author) VALUES(${trashed},'QA note','QA')`;
      await connection`INSERT INTO post_versions(post_id,content,status,changed_by) VALUES(${trashed},'QA version','draft','QA')`;
      await connection`INSERT INTO publication_attempts(post_id,attempt_number,status) VALUES(${attempted},1,'failed')`;
      const trashRequest=(id:string,action:string)=>new NextRequest(`https://qa.example.test/api/posts/${id}/trash?workspace=${a}`,{method:'POST',headers:{origin:'https://qa.example.test',cookie:`sp_admin=${token}`,'content-type':'application/json'},body:JSON.stringify({action})});
      assert.equal((await trash(trashRequest(foreignTrash,'restore'),params(foreignTrash))).status,404);
      assert.equal((await trash(trashRequest(trashed,'restore'),params(trashed))).status,200);
      assert.equal((await trash(trashRequest(trashed,'purge'),params(trashed))).status,409);
      await connection`UPDATE posts SET deleted_at=now() WHERE id=${trashed}`;
      assert.equal((await trash(trashRequest(foreignTrash,'purge'),params(foreignTrash))).status,409);
      assert.equal((await trash(trashRequest(attempted,'purge'),params(attempted))).status,409);
      assert.equal((await trash(trashRequest(trashed,'purge'),params(trashed))).status,200);
      assert.equal((await connection`SELECT id FROM posts WHERE id=${trashed}`).length,0);
      assert.equal((await connection`SELECT id FROM post_media WHERE post_id=${trashed}`).length,0);
      assert.equal((await connection`SELECT id FROM post_notes WHERE post_id=${trashed}`).length,0);
      assert.equal((await connection`SELECT id FROM post_versions WHERE post_id=${trashed}`).length,0);
      assert.equal((await connection`SELECT id FROM posts WHERE id IN (${foreignTrash},${attempted})`).length,2);
      const linkedTrash=randomUUID();
      await connection`INSERT INTO posts(id,page_id,content,status,deleted_at) VALUES(${linkedTrash},${pageA},'QA protected linked draft','draft',now())`;
      await connection`INSERT INTO post_media(post_id,type,url) VALUES(${linkedTrash},'image','https://example.test/qa-preserved.png')`;
      await connection`INSERT INTO post_notes(post_id,body,author) VALUES(${linkedTrash},'QA preserved note','QA')`;
      await connection`INSERT INTO post_versions(post_id,content,status,changed_by) VALUES(${linkedTrash},'QA preserved version','draft','QA')`;
      await connection`INSERT INTO post_recurrences(source_post_id,frequency,next_run_at,active) VALUES(${linkedTrash},'weekly',now()+interval '1 day',false)`;
      assert.equal((await trash(trashRequest(linkedTrash,'purge'),params(linkedTrash))).status,503);
      assert.equal((await connection`SELECT id FROM posts WHERE id=${linkedTrash}`).length,1);
      assert.equal((await connection`SELECT id FROM post_media WHERE post_id=${linkedTrash}`).length,1);
      assert.equal((await connection`SELECT id FROM post_notes WHERE post_id=${linkedTrash}`).length,1);
      assert.equal((await connection`SELECT id FROM post_versions WHERE post_id=${linkedTrash}`).length,1);
      const {nearbyScheduled}=await import('../src/services/prepublish');
      const time=new Date(Date.now()+7200000);
      await connection`INSERT INTO posts(page_id,content,status,scheduled_at) VALUES(${pageA},'QA own conflict','scheduled',${time.toISOString()}::timestamptz),(${pageB},'QA foreign conflict','scheduled',${time.toISOString()}::timestamptz)`;
      assert.equal(await nearbyScheduled(time,undefined,context),1);
      await connection`UPDATE workspace_members SET is_active=false WHERE workspace_id=${a} AND user_id=${member}`;
      assert.equal(await nearbyScheduled(time,undefined,context),0);
      await connection`UPDATE workspace_members SET is_active=true WHERE workspace_id=${a} AND user_id=${member}`;
      await connection`UPDATE workspace_members SET role='viewer' WHERE workspace_id=${a} AND user_id=${member}`;
      assert.equal((await PATCH(request(),params())).status,403);
      assert.equal((await trash(trashRequest(foreignTrash,'purge'),params(foreignTrash))).status,403);
    } finally {
      if(previousSecret===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=previousSecret;
      await connection`UPDATE users SET role='viewer' WHERE id=${member}`;
      await connection`UPDATE workspace_members SET role='support' WHERE workspace_id=${a} AND user_id=${member}`;
    }
  });
  await t.test("inactive user, membership, workspace or page immediately removes scope", async () => {
    await connection`UPDATE workspace_members SET is_active=false WHERE workspace_id=${a} AND user_id=${member}`;
    assert.equal((await membership()).rows.length,0); assert.equal((await pages()).rows.length,0);
    await connection`UPDATE workspace_members SET is_active=true WHERE workspace_id=${a} AND user_id=${member}`;
    await connection`UPDATE users SET is_active=false WHERE id=${member}`;
    assert.equal((await membership()).rows.length,0); assert.equal((await pages()).rows.length,0);
    await connection`UPDATE users SET is_active=true WHERE id=${member}`;
    await connection`UPDATE workspaces SET is_active=false WHERE id=${a}`;
    assert.equal((await membership()).rows.length,0); assert.equal((await pages()).rows.length,0);
    await connection`UPDATE workspaces SET is_active=true WHERE id=${a}`;
    await connection`UPDATE facebook_pages SET is_active=false WHERE id=${pageA}`;
    assert.equal((await pages()).rows.length,0);
  });
  await t.test("database rejects duplicate ownership, memberships and unsupported roles", async () => {
    await assert.rejects(connection`INSERT INTO workspace_pages(workspace_id,page_id) VALUES(${b},${pageA})`);
    await assert.rejects(connection`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${a},${member},'owner')`);
    await assert.rejects(connection`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${b},${member},'reviewer')`);
    await assert.rejects(connection`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${randomUUID()},${member},'viewer')`);
  });
  await t.test("overlapping ownership claims cannot share one page across customers", async () => {
    const page = randomUUID();
    await connection`INSERT INTO facebook_pages(id,name,facebook_page_id) VALUES(${page},'QA concurrent',${`qa-${page}`})`;
    const results = await Promise.allSettled([
      connection`INSERT INTO workspace_pages(workspace_id,page_id) VALUES(${a},${page})`,
      connection`INSERT INTO workspace_pages(workspace_id,page_id) VALUES(${b},${page})`,
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length,1);
    assert.equal(results.filter(r => r.status === "rejected").length,1);
    assert.equal((await connection`SELECT count(*)::int AS n FROM workspace_pages WHERE page_id=${page}`)[0].n,1);
  });
});
