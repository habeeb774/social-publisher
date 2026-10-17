import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SOURCES} from '../src/services/ai-news/model';
import {articleMetadata,boundedText,newsroomCandidates,readAiSource} from '../src/services/ai-news/sources';

const source=SOURCES.find(s=>s.id==='anthropic')!;
const now=Date.parse('2026-10-17T12:00:00Z');
const anchor=(url:string,date='Oct 16, 2026')=>`<a href="${url}"><time>${date}</time><span>Test announcement</span></a>`;
const url='https://www.anthropic.com/news/test-claude-update';
const article=(changes:Record<string,unknown>={})=>`<script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',headline:'Claude test announcement',url,datePublished:'2026-10-16T15:20:00Z',dateModified:'2026-10-17T10:00:00Z',description:'Synthetic Anthropic test, not real news',...changes})}</script>`;

test('newsroom links stay on the exact approved origin/path and use index dates only for bounded discovery',()=>{
 const html=anchor('/news/test-claude-update')+anchor('/news/old-news','Jan 1, 2000')+anchor('https://attacker.invalid/news/stolen')+anchor('/news/query?next=http://localhost')+`<script>${anchor('/news/fake-script-link')}</script>`;
 assert.deepEqual(newsroomCandidates(html,source,now),[url]);
 assert.throws(()=>newsroomCandidates('<html>No dated article links</html>',source,now),/NEWSROOM_FORMAT_REFUSED/);
 const many=Array.from({length:8},(_,i)=>anchor('/news/item-'+i)).join('');
 assert.equal(newsroomCandidates(many,source,now).length,3);
});
test('article evidence requires original timestamp and matching URL; modified/crawl time cannot fabricate freshness',()=>{
 const item=articleMetadata(article(),url,source)!;
 assert.equal(item.title,'Claude test announcement');
 assert.equal(item.url,'https://anthropic.com/news/test-claude-update');
 assert.equal(item.publishedAt.toISOString(),'2026-10-16T15:20:00.000Z');
 for(const changes of [{datePublished:undefined},{datePublished:'2026-10-16'},{datePublished:'bad'},{url:'https://attacker.invalid/news/a'},{url:'https://www.anthropic.com/news/different'}])assert.equal(articleMetadata(article(changes),url,source),null);
 assert.equal(articleMetadata('<script type="application/ld+json">not JSON</script>',url,source),null);
});
test('newsroom reader only fetches dated approved candidates and never retries denied access through a bypass',async()=>{
 // Dates track the real clock because the reader itself applies the production freshness window.
 const date=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date());
 const calls:string[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const requested=String(input);calls.push(requested);assert.equal(init?.redirect,'error');
  return new Response(requested===source.url?anchor('/news/test-claude-update',date):article());
 };
 const items=await readAiSource(source,fetcher);assert.equal(items.length,1);assert.deepEqual(calls,[source.url,url]);
 let deniedCalls=0;
 await assert.rejects(readAiSource(source,async()=>{deniedCalls++;return new Response('Forbidden',{status:403});}),/SOURCE_UNAVAILABLE/);
 assert.equal(deniedCalls,1);
});
test('all source bodies stay bounded and RSS still rejects XML entities and HTML masquerading as a feed',async()=>{
 await assert.rejects(boundedText('https://openai.com/news/rss.xml',async()=>new Response('x'.repeat(1024*1024+1))),/SOURCE_TOO_LARGE/);
 const google=SOURCES.find(s=>s.id==='gemini')!;
 for(const text of ['<!DOCTYPE rss [<!ENTITY x "unsafe">]><rss></rss>','<html><body>Not RSS</body></html>'])await assert.rejects(readAiSource(google,async()=>new Response(text)),/FEED_FORMAT_REFUSED/);
 const items=await readAiSource(google,async()=>new Response('<rss><channel><item><title>Gemini test</title><link>https://blog.google/test</link><pubDate>Fri, 16 Oct 2026 15:20:00 GMT</pubDate></item></channel></rss>'));
 assert.equal(items[0].title,'Gemini test');
});
