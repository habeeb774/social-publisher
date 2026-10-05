import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { fileURLToPath } from "node:url";
if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL_REQUIRED");
await migrate(drizzle(neon(process.env.DATABASE_URL)),{migrationsFolder:fileURLToPath(new URL("../drizzle/comments-team",import.meta.url)),migrationsTable:"comment_team_migrations"});
console.log(JSON.stringify({migration:"comment_team",success:true}));
