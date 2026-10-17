import {createHash} from 'node:crypto';
import {sql} from 'drizzle-orm';

export function canonicalTechUrl(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('INVALID_TECH_SOURCE');
 url.hash='';url.hostname=url.hostname.replace(/^www\./,'');
 for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid'].includes(key.toLowerCase()))url.searchParams.delete(key);
 url.searchParams.sort();url.pathname=url.pathname.replace(/\/+$/,'')||'/';
 return url.href;
}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function techArticleKeys(pageId:string,url:string,title:string){
 const headline=title.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0640]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 return {url:`tech_article:${pageId}:${digest(canonicalTechUrl(url))}`,title:`tech_headline:${pageId}:${digest(headline)}`};
}

/** A single statement commits the durable claims, post and attachment together.
 * Unique settings keys arbitrate concurrent workers; crashes cannot leave a post
 * without its dedup marker or reserve a marker without its media on SQL failure.
 */
export function enqueueTechArticleQuery(input:{id:string;pageId:string;hourKey:string;urlKey:string;titleKey:string;seenKey:string;content:string;imageUrl:string;tags:string[];metadata:string;at:string}){
 return sql`WITH hour_claim AS (
  INSERT INTO settings(key,value) VALUES(${input.hourKey},${input.metadata}) ON CONFLICT DO NOTHING RETURNING key
 ), url_claim AS (
  INSERT INTO settings(key,value) SELECT ${input.urlKey},${input.metadata} FROM hour_claim ON CONFLICT DO NOTHING RETURNING key
 ), title_claim AS (
  INSERT INTO settings(key,value) SELECT ${input.titleKey},${input.metadata} FROM url_claim ON CONFLICT DO NOTHING RETURNING key
 ), created_post AS (
  INSERT INTO posts(id,page_id,content,scheduled_at,timezone,status,category,tags)
  SELECT ${input.id}::uuid,${input.pageId}::uuid,${input.content},${input.at}::timestamptz,'Asia/Riyadh','scheduled','أخبار',ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(input.tags)}::jsonb)) FROM title_claim RETURNING id
 ), media AS (
  INSERT INTO post_media(post_id,type,url,mime_type) SELECT id,'image',${input.imageUrl},'image/png' FROM created_post RETURNING post_id
 ), legacy_seen AS (
  INSERT INTO settings(key,value) SELECT ${input.seenKey},${input.metadata} FROM created_post ON CONFLICT DO NOTHING RETURNING key
 ) SELECT post_id AS id FROM media`;
}
