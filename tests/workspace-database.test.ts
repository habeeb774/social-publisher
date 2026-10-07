import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { assertDisposableDatabase } from "./database-safety";
import { workspaceMembershipQuery, workspacePagesQuery } from "../src/services/workspace-access";

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

  await t.test("only actual membership grants access, not a global administrator role", async () => {
    assert.equal((await membership()).rows[0].role, "support");
    assert.deepEqual((await pages()).rows.map(r => r.id), [pageA]);
    for (const [user,workspace] of [[member,b],[outsider,a],[outsider,b]]) {
      assert.equal((await membership(user,workspace)).rows.length,0);
      assert.equal((await pages(user,workspace)).rows.length,0);
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
