import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { assertDisposableDatabase } from "./database-safety";
import { versionRestoreQuery } from "../src/services/version-restore-query";

const testUrl=process.env.TEST_DATABASE_URL;
test("database media failure rolls back the entire restoration",{skip:!testUrl&&"TEST_DATABASE_URL not set"},async()=>{
  assertDisposableDatabase(testUrl,process.env.DISPOSABLE_TEST_DATABASE_HOST,process.env.DATABASE_URL);
  assert.ok(testUrl);
  const connection=neon(testUrl);
  const id=randomUUID(),page=randomUUID(),at=new Date("2026-10-08T10:00:00Z");
  const query=new PgDialect().sqlToQuery(versionRestoreQuery({postId:id,updatedAt:at,content:"restored",scheduledAt:null,media:[{url:"qa-fail",type:"image"}],actor:"QA"}));
  // Test-only literals for a PL/pgSQL exception block; production queries remain parameterized.
  const literal=(value:unknown):string=>value===null?"NULL":`'${String(value).replaceAll("'","''")}'`;
  const statement=query.sql.replace(/\$(\d+)/g,(_,index)=>literal(query.params[Number(index)-1]));
  await connection.transaction([
    connection.query("CREATE TEMP TABLE posts (LIKE public.posts INCLUDING ALL) ON COMMIT DROP"),
    connection.query("CREATE TEMP TABLE post_versions (LIKE public.post_versions INCLUDING ALL) ON COMMIT DROP"),
    connection.query("CREATE TEMP TABLE post_media (LIKE public.post_media INCLUDING ALL) ON COMMIT DROP"),
    connection.query("ALTER TABLE pg_temp.post_media ADD CHECK (url <> 'qa-fail')"),
    connection`INSERT INTO pg_temp.posts(id,page_id,content,status,in_queue,updated_at) VALUES(${id},${page},'original','approved',true,${at.toISOString()})`,
    connection`INSERT INTO pg_temp.post_media(post_id,url,type) VALUES(${id},'original-image','image')`,
    connection.query(`DO $qa$ BEGIN
      BEGIN EXECUTE ${literal(statement)}; RAISE EXCEPTION 'Expected media failure';
      EXCEPTION WHEN check_violation THEN NULL; END;
      IF (SELECT content FROM pg_temp.posts) <> 'original' OR (SELECT status FROM pg_temp.posts) <> 'approved'
        OR NOT (SELECT in_queue FROM pg_temp.posts) OR (SELECT count(*) FROM pg_temp.post_versions) <> 0
        OR (SELECT count(*) FROM pg_temp.post_media) <> 1 OR (SELECT url FROM pg_temp.post_media) <> 'original-image'
      THEN RAISE EXCEPTION 'Partial restoration detected'; END IF;
    END $qa$`),
  ]);
});
