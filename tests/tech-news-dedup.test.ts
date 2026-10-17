import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {PgDialect} from 'drizzle-orm/pg-core';
import {canonicalTechUrl,techArticleKeys,enqueueTechArticleQuery} from '../src/services/tech-news-dedup';
test('article identity ignores trackers, title punctuation and diacritics, not semantic query IDs',()=>{
 assert.equal(canonicalTechUrl('https://www.example.test/news/?utm_source=feed&fbclid=a&id=4#x'),'https://example.test/news?id=4');
 const a=techArticleKeys('page','https://example.test/a','تحديثٌ لأدوات العمل!');
 const b=techArticleKeys('page','https://example.test/b','تحديث لأدوات العمل');
 assert.equal(a.title,b.title);assert.notEqual(a.url,b.url);
 assert.notEqual(a.title,techArticleKeys('other','https://example.test/a','تحديث لأدوات العمل').title);
 assert.throws(()=>canonicalTechUrl('http://example.test/a'));
});
test('atomic enqueue prevents repeats across hours/restarts and rolls back claims on failed media',async()=>{
 const pg=new PGlite(),dialect=new PgDialect(),pageId=randomUUID();
 try{
  await pg.exec(`CREATE TABLE settings(key text PRIMARY KEY,value text NOT NULL);
   CREATE TABLE posts(id uuid PRIMARY KEY,page_id uuid,content text,scheduled_at timestamptz,timezone text,status text,category text,tags text[]);
   CREATE TABLE post_media(post_id uuid REFERENCES posts(id),type text,url text CHECK(url LIKE 'https://%'),mime_type text);`);
  const input=(hour:string,url:string,title='عنوان تقني عربي')=>{
   const keys=techArticleKeys(pageId,url,title);
   return {id:randomUUID(),pageId,hourKey:'hour:'+hour,urlKey:keys.url,titleKey:keys.title,seenKey:'legacy:'+url,content:title,imageUrl:'https://app.test/image',tags:['تقنية','أدوات العمل'],metadata:'{}',at:new Date().toISOString()};
  };
  const run=async(i:ReturnType<typeof input>)=>{const q=dialect.sqlToQuery(enqueueTechArticleQuery(i));return pg.query(q.sql,q.params);};
  const first=input('1','https://example.test/a');
  assert.equal((await run(first)).rows.length,1);
  assert.equal((await run(first)).rows.length,0,'same hour or restart does not enqueue again');
  assert.equal((await run(input('2','https://example.test/a'))).rows.length,0,'next hour cannot reuse same URL');
  assert.equal((await run(input('3','https://example.test/b'))).rows.length,0,'different URL cannot reuse same headline');
  const broken={...input('4','https://example.test/c','عنوان مختلف لتطبيق إنتاجية'),imageUrl:'invalid'};
  await assert.rejects(run(broken));
  assert.equal((await pg.query('SELECT 1 FROM settings WHERE key=$1',[broken.urlKey])).rows.length,0,'SQL failure rolls back article reservation');
  assert.equal((await run({...broken,imageUrl:'https://app.test/valid'})).rows.length,1,'retry after rollback can enqueue once');
  const posts=await pg.query<{tags:string[]}>('SELECT tags FROM posts');assert.equal(posts.rows.length,2);
  assert.deepEqual(posts.rows[0].tags,['تقنية','أدوات العمل']);
  assert.equal((await pg.query('SELECT * FROM post_media')).rows.length,2);
 }finally{await pg.close();}
});
