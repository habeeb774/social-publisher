import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const posts = await sql`select id,content,status,scheduled_at,last_error from posts order by created_at desc limit 5`;
const runs = await sql`select triggered_at,status,processed_count,error_message from scheduler_runs order by triggered_at desc limit 5`;
const attempts = await sql`select post_id,status,error_message,created_at from publication_attempts order by created_at desc limit 5`;
console.log(JSON.stringify({posts,runs,attempts}));
