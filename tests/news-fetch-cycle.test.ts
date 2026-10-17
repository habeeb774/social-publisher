import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNewsFetchCycle} from '../src/services/news-fetch-cycle';
import {createTechFeedScan} from '../src/services/tech-news';
import {readAiSource} from '../src/services/ai-news/sources';
import {SOURCES as AI_SOURCES} from '../src/services/ai-news/model';
import {SOURCES as ELON_SOURCES} from '../src/services/elon-news/model';
import {readElonSource} from '../src/services/elon-news/service';

test('simultaneous news consumers share one fetch, each with a readable independent body',async()=>{
 let count=0;
 const cycle=createNewsFetchCycle((async()=>{count++;return new Response('shared news',{headers:{'content-type':'application/xml'}});}) as typeof fetch);
 const responses=await Promise.all(Array.from({length:8},()=>cycle.fetcher('https://example.test/feed')));
 assert.deepEqual(await Promise.all(responses.map(r=>r.text())),Array(8).fill('shared news'));
 assert.equal(count,1);assert.deepEqual(cycle.stats(),{requests:1,hits:7,sources:1});
 await cycle.fetcher('https://example.test/other');assert.equal(count,2);
});
test('failed requests are shared for the cycle but retried in a fresh cycle, never globally cached',async()=>{
 let count=0;const fetcher=(async()=>{count++;throw new Error('offline');}) as typeof fetch;
 const first=createNewsFetchCycle(fetcher);
 await Promise.all([assert.rejects(first.fetcher('https://example.test/feed')),assert.rejects(first.fetcher('https://example.test/feed'))]);
 assert.equal(count,1);
 await assert.rejects(createNewsFetchCycle(fetcher).fetcher('https://example.test/feed'));assert.equal(count,2);
});
test('shared news requests reject credentials/writes, bound bodies and preserve access denials',async()=>{
 let count=0;
 const cycle=createNewsFetchCycle((async()=>{count++;return new Response('denied',{status:403});}) as typeof fetch);
 await assert.rejects(cycle.fetcher('http://example.test/feed'));
 await assert.rejects(cycle.fetcher('https://example.test/feed',{headers:{Authorization:'secret'}}));
 await assert.rejects(cycle.fetcher('https://example.test/feed',{method:'POST'}));
 assert.equal(count,0);
 assert.equal((await cycle.fetcher('https://example.test/feed')).status,403);
 assert.equal((await cycle.fetcher('https://example.test/feed')).status,403);assert.equal(count,1);
 const large=createNewsFetchCycle((async()=>new Response('x'.repeat(1024*1024+1))) as typeof fetch);
 await assert.rejects(large.fetcher('https://example.test/large'),/TOO_LARGE/);
});
test('two technology destinations parse the nine feeds once, lazily',async()=>{
 let count=0;
 const scan=createTechFeedScan((async()=>{count++;return new Response('<rss><channel><item><title>تحديث أدوات الذكاء الاصطناعي</title><link>https://example.test/news</link><pubDate>Sat, 17 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>');}) as typeof fetch);
 assert.equal(count,0);
 const [a,b]=await Promise.all([scan(),scan()]);assert.equal(count,9);assert.equal(a,b);
 assert.equal(a.flat().length,9);
});
test('AI, Elon and both technology destinations share matching source requests but retain their own parsing metadata',async()=>{
 const counts=new Map<string,number>();
 const cycle=createNewsFetchCycle((async(input)=>{
  const url=String(input);counts.set(url,(counts.get(url)??0)+1);
  return new Response('<rss><channel><item><title>AI software update</title><link>https://arstechnica.com/story</link><pubDate>Sat, 17 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>');
 }) as typeof fetch);
 const scan=createTechFeedScan(cycle.fetcher);
 const [tech,second,ai,elon]=await Promise.all([scan(),scan(),readAiSource(AI_SOURCES.find(s=>s.id==='ars')!,cycle.fetcher),readElonSource(ELON_SOURCES.find(s=>s.id==='ars')!,cycle.fetcher)]);
 assert.equal(tech,second);
 assert.equal(counts.get('https://feeds.arstechnica.com/arstechnica/index'),1);
 assert.equal(cycle.stats().requests,9);assert.equal(cycle.stats().hits,2);
 assert.equal(ai[0].topic,'الذكاء الاصطناعي');assert.equal(elon[0].topic,'إيلون ماسك');
});
