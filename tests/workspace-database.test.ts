import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { assertDisposableDatabase } from "./database-safety";
import { workspaceMembershipQuery, workspacePagesQuery } from "../src/services/workspace-access";
import { NextRequest } from "next/server";
import { authorizeWorkspace, createWorkspaceAccessHandler } from "../src/services/workspace-request";
import { createWorkspacePostListHandler, workspacePostListQuery } from "../src/services/workspace-posts";

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
