import { assertDisposableDatabase } from "../tests/database-safety";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";

// Only synthetic fixtures; never use this script to seed the application database.
assertDisposableDatabase(process.env.TEST_DATABASE_URL,process.env.DISPOSABLE_TEST_DATABASE_HOST,process.env.DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const db = getDb();
await db.execute(sql`insert into facebook_pages(id,name,facebook_page_id,platform,is_active)
  values ('de8db720-4803-473a-9972-514a3fc81ca8','صفحة اختبار معزولة','qa-offline-page','facebook',true)
  on conflict(id) do nothing`);
await db.execute(sql`insert into posts(id,page_id,content,status)
  values ('bdc54091-cf37-4b44-836a-a42c1dd483a6','de8db720-4803-473a-9972-514a3fc81ca8','مسودة اختبار معزولة','draft')
  on conflict(id) do nothing`);
console.log("Disposable database fixtures ready (no Meta credentials or real customer data).");
