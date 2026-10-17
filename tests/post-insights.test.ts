import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getPostPerformance,PERFORMANCE_METRICS} from '../src/services/post-insights';
import {META_OAUTH_SCOPES} from '../src/services/meta-oauth';

const secret='private-test-token';
const resolveToken=async()=>secret;
test('current view metrics are read separately with lifetime period and header-only credentials',async()=>{
 const requests:string[]=[];
 const fetcher=(async(url,init)=>{
  const parsed=new URL(String(url));requests.push(parsed.toString());
  assert.ok(!parsed.toString().includes(secret));
  assert.equal(new Headers(init?.headers).get('authorization'),`Bearer ${secret}`);
  assert.equal((init as RequestInit&{next:{revalidate:number}}).next.revalidate,300);
  const metric=parsed.searchParams.get('metric');
  if(!metric)return Response.json({reactions:{summary:{total_count:3}},comments:{summary:{total_count:0}}});
  assert.equal(parsed.searchParams.get('period'),'lifetime');
  return Response.json({data:[{name:metric,values:[{value:metric==='post_media_view'?125:metric==='post_reactions_by_type_total'?{like:3}:0}]}]});
 }) as typeof fetch;
 const result=await getPostPerformance('123_456','123',{fetcher,resolveToken});
 assert.equal(result.available,true);assert.deepEqual(result.issues,[]);
 assert.equal(result.metrics.find(m=>m.key==='post_media_view')?.value,125);
 assert.equal(result.metrics.find(m=>m.key==='post_total_media_view_unique')?.value,0,'actual zero is not missing');
 assert.equal(result.metrics.find(m=>m.key==='comments')?.value,0);
 assert.equal(requests.length,5);
 assert.ok(requests.every(r=>!r.includes('post_impressions')));
 assert.ok(META_OAUTH_SCOPES.includes('read_insights'));
});
test('successful engagement cannot conceal a missing permission for views',async()=>{
 const fetcher=(async(url)=>new URL(String(url)).searchParams.has('metric')?
  Response.json({error:{code:200,message:secret}},{status:403}):Response.json({reactions:{summary:{total_count:0}},comments:{summary:{total_count:0}}})) as typeof fetch;
 const result=await getPostPerformance('123_456','123',{fetcher,resolveToken});
 assert.equal(result.available,true);
 assert.equal(result.metrics.some(m=>m.key==='post_media_view'),false,'never replace a missing view metric with zero');
 assert.equal(result.issues?.find(i=>i.metric==='post_media_view')?.code,'INSIGHTS_PERMISSION_REQUIRED');
 assert.ok(!JSON.stringify(result).includes(secret));
});
test('empty, mismatched and invalid insight values remain unavailable, not synthetic zero',async()=>{
 for(const data of [[],[{name:'wrong_metric',values:[{value:3}]}],[{name:'post_media_view',values:[{value:'99'}]}],[{name:'post_media_view',values:[{value:-1}]}]]){
  const result=await getPostPerformance('123_456','123',{resolveToken,fetcher:(async()=>Response.json({data})) as typeof fetch});
  assert.equal(result.metrics.some(m=>m.key==='post_media_view'),false);
  assert.ok(result.issues?.some(i=>i.metric==='post_media_view'));
 }
});
test('transport and token failures are sanitized and no requests use invalid IDs',async()=>{
 const fetcher=(async()=>{throw new Error('https://host/?access_token='+secret);}) as typeof fetch;
 const result=await getPostPerformance('123_456','123',{fetcher,resolveToken});
 assert.equal(result.available,false);assert.ok(!JSON.stringify(result).includes(secret));
 let called=false;
 await getPostPerformance('../bad','123',{resolveToken:async()=>{called=true;return secret;},fetcher});
 assert.equal(called,false);
 assert.ok(Object.keys(PERFORMANCE_METRICS).includes('post_media_view'));
});
