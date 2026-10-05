import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
// Dedicated additive migration: never replays older production Drizzle migrations.
if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL_REQUIRED");
const db=neon(process.env.DATABASE_URL);
const migration=await readFile(new URL("../drizzle/0008_comments_inbox.sql",import.meta.url),"utf8");
const hash=createHash("sha256").update(migration).digest("hex");
await db`CREATE TABLE IF NOT EXISTS comments_schema_migrations(version text PRIMARY KEY,hash text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`;
const [existing]=await db`SELECT hash FROM comments_schema_migrations WHERE version='0008_comments_inbox'`;
if(existing&&existing.hash!==hash)throw new Error("MIGRATION_HASH_MISMATCH");
if(!existing){
  await db.transaction([
    ...migration.split(";").map(s=>s.trim()).filter(Boolean).map(s=>db.query(s)),
    db`INSERT INTO comments_schema_migrations(version,hash) VALUES('0008_comments_inbox',${hash})`,
  ]);
}
console.log(JSON.stringify({migration:"0008_comments_inbox",applied:!existing}));
