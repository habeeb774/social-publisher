import {parseFeed,type FeedItem} from '../tech-news';
import {canonicalUrl,SOURCES} from './model';

type Source=typeof SOURCES[number];
type SourceInfo={name:string;url:string;host:string};
export async function boundedText(url:string,fetcher:typeof fetch=fetch){
 const response=await fetcher(url,{signal:AbortSignal.timeout(12000),redirect:'error',cache:'no-store',headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html'}});
 if(!response.ok)throw new Error('SOURCE_UNAVAILABLE');
 const reader=response.body?.getReader();if(!reader)throw new Error('SOURCE_EMPTY');
 const parts:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024*1024)throw new Error('SOURCE_TOO_LARGE');parts.push(part.value);}}
 finally{await reader.cancel();reader.releaseLock();}
 return Buffer.concat(parts).toString('utf8');
}
export function newsroomCandidates(html:string,source:SourceInfo,now=Date.now()){
 const origin=new URL(source.url).origin,candidates=new Map<string,{url:string;date:number}>();
 // Read rendered links only, never serialized scripts or instructions in page content.
 const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 for(const match of markup.matchAll(/<a\b([^>]{0,4000})>([\s\S]*?)<\/a>/gi)){
  const href=match[1].match(/\bhref=["']([^"']+)["']/i)?.[1];
  const when=match[2].match(/<time\b[^>]*>([^<]+)<\/time>/i)?.[1]?.trim();
  if(!href||!when||!(/^[A-Z][a-z]{2,8} \d{1,2}, \d{4}$/.test(when)))continue;
  try{
   const url=new URL(href,source.url);canonicalUrl(url.href,source.host);
   if(url.origin!==origin||!/^\/news\/[a-z0-9-]+\/?$/.test(url.pathname)||url.search||url.hash)continue;
   const date=Date.parse(when+' 00:00:00 UTC');if(!Number.isFinite(date)||date>now+86400000)continue;
   candidates.set(url.href,{url:url.href,date});
  }catch{/* Ignore untrusted/non-article links. */}
 }
 if(!candidates.size)throw new Error('NEWSROOM_FORMAT_REFUSED');
 // Day-only index dates only prioritize fetches. Never use them as a publication timestamp.
 return [...candidates.values()].filter(item=>item.date>=now-72*3600000).sort((a,b)=>b.date-a.date).slice(0,3).map(item=>item.url);
}
export function articleMetadata(html:string,url:string,source:SourceInfo):FeedItem|null{
 const canonical=canonicalUrl(url,source.host);
 for(const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{
   const value:unknown=JSON.parse(script[1]);
   const objects:unknown[]=Array.isArray(value)?value:[value];
   for(let n=0;n<objects.length&&n<50;n++){
    const item=objects[n];if(!item||typeof item!=='object'||Array.isArray(item))continue;
    const record=item as Record<string,unknown>;
    if(Array.isArray(record['@graph']))objects.push(...record['@graph']);
    if(record['@type']!=='NewsArticle'&&record['@type']!=='Article')continue;
    if(typeof record.headline!=='string'||typeof record.datePublished!=='string'||typeof record.url!=='string')continue;
    // Require the original publication time, never dateModified or crawl time.
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(record.datePublished))continue;
    if(canonicalUrl(record.url,source.host)!==canonical)continue;
    const publishedAt=new Date(record.datePublished);if(!Number.isFinite(publishedAt.getTime()))continue;
    const clean=(text:string)=>text.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    const title=clean(record.headline).slice(0,500);if(!title)continue;
    return {title,url:canonical,publishedAt,source:source.name,topic:'الذكاء الاصطناعي',summary:typeof record.description==='string'?clean(record.description).slice(0,600):''};
   }
  }catch{/* Invalid structured data must never fabricate evidence. */}
 }
 return null;
}
export async function readAiSource(source:Source,fetcher:typeof fetch=fetch){
 const text=await boundedText(source.url,fetcher);
 if(source.id==='anthropic'){
  const urls=newsroomCandidates(text,source);
  const articles=await Promise.all(urls.map(async url=>{
   const item=articleMetadata(await boundedText(url,fetcher),url,source);
   if(!item)throw new Error('ARTICLE_METADATA_REQUIRED');return item;
  }));
  return articles;
 }
 if(!/<(?:rss|feed)\b/i.test(text)||/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('FEED_FORMAT_REFUSED');
 return parseFeed(text,{name:source.name,url:source.url,topic:'الذكاء الاصطناعي'});
}
