import {strict as assert} from "node:assert";
import {test} from "node:test";
import {PgDialect} from "drizzle-orm/pg-core";
import type {SQL} from "drizzle-orm";
import {publishDueMovieReels,reelCaption,moviePublishingEnabled,type MoviePublishDeps} from "../src/services/movie-reels/publisher";

const id="12345678-1234-4123-8123-123456789012";
const leased={id,lease_token:id,clip_id:id,part_number:2,title:"فيلمي",description:"وصف",output_storage_key:`movies/${id}/clips/0002/r1.mp4`,facebook_page_id:"1000"};
function harness(overrides:Partial<MoviePublishDeps>={},queue=[leased]){
  const statements:string[]=[];const params:unknown[][]=[];
  const deps:MoviePublishDeps={
    execute:async(query:SQL)=>{const q=new PgDialect().sqlToQuery(query);statements.push(q.sql);params.push(q.params);
      if(q.sql.includes("SET status='publishing'"))return {rows:queue.length?[queue.shift()]:[]};
      return {rows:q.sql.includes("SET status='published'")?[{id}]:[]};},
    transaction:async queries=>{let rows:unknown[]=[];for(const query of queries)rows=(await deps.execute(query)).rows;return rows;},
    clipBytes:async()=>Buffer.from("0000ftypisom"),publish:async()=>({id:"555"}),permalink:async()=>"https://www.facebook.com/reel/555",...overrides};
  return {deps,statements,params};
}

test("publishing is off unless the separate publishing flag is set",async()=>{
  delete process.env.MOVIE_REELS_PUBLISHING_ENABLED;process.env.MOVIE_REELS_ENABLED="true";
  assert.equal(await moviePublishingEnabled(),false);
  assert.deepEqual(await publishDueMovieReels(1),{enabled:false,published:0,failed:0});
});

test("successful send stores remote id and permalink under the lease",async()=>{
  const sent:string[]=[];
  const {deps,statements,params}=harness({publish:async(_page,_video,caption)=>{sent.push(caption);return {id:"555"};}});
  assert.deepEqual(await publishDueMovieReels(3,deps),{enabled:true,published:1,failed:0});
  assert.match(statements[0],/RIGHTS_OR_REVIEW_INVALID/);
  assert.equal(sent[0],"فيلمي - الجزء 2\n\nوصف");
  const index=statements.findIndex(sql=>/SET status='published'/.test(sql));
  assert.ok(index>0);assert.ok(params[index].includes("555")&&params[index].includes("https://www.facebook.com/reel/555"));
});

test("off switch prevents leasing or network calls",async()=>{
 const {deps,statements}=harness({enabled:async()=>false,publish:async()=>{throw new Error("must not send");}});
 assert.deepEqual(await publishDueMovieReels(1,deps),{enabled:false,published:0,failed:0});
 assert.equal(statements.length,0);
});
test("pause during file read restores the scheduled lease without consuming attempts",async()=>{
 let enabled=true,sends=0;
 const {deps,statements}=harness({enabled:async()=>enabled,clipBytes:async()=>{enabled=false;return Buffer.from("video");},publish:async()=>{sends++;return {id:"1"};}});
 await publishDueMovieReels(1,deps);
 assert.equal(sends,0);assert.match(statements.at(-1)!,/attempts=greatest\(0,attempts-1\)/);
 assert.match(statements.at(-1)!,/status='scheduled'/);
});

test("graph rejection is retryable; network ambiguity becomes outcome_unknown",async()=>{
  const rejected=harness({publish:async()=>{throw new Error("FACEBOOK_GRAPH_ERROR: (#100) bad");}});
  await publishDueMovieReels(1,rejected.deps);
  assert.ok(rejected.params.at(-1)!.includes("rejected"));
  const unknown=harness({publish:async()=>{throw new Error("MCP_PUBLISH_OUTCOME_UNKNOWN");}});
  await publishDueMovieReels(1,unknown.deps);
  assert.ok(unknown.params.at(-1)!.includes("unknown"));
});

test("storage failure never calls Meta",async()=>{
  let calls=0;
  const {deps,params}=harness({clipBytes:async()=>{throw new Error("MOVIE_CLIP_FILE_INVALID");},publish:async()=>{calls++;return {id:"1"};}});
  assert.equal((await publishDueMovieReels(1,deps)).failed,1);
  assert.equal(calls,0);assert.ok(params.at(-1)!.includes("rejected"));
});

test("caption keeps part number exactly once",()=>{
  assert.equal(reelCaption({title:"فيلم - الجزء 3",description:"",part_number:3}),"فيلم - الجزء 3");
});

test("publish driver defaults to meta, mock refused in production, junk rejected",async()=>{
  const {moviePublishDriver,movieReelTarget,metaReelTarget}=await import("../src/services/movie-reels/publish-driver");
  assert.equal(moviePublishDriver({}),"meta");
  assert.equal(movieReelTarget({}),metaReelTarget);
  assert.equal(moviePublishDriver({MOVIE_PUBLISH_DRIVER:"mock",NODE_ENV:"development"}),"mock");
  assert.throws(()=>moviePublishDriver({MOVIE_PUBLISH_DRIVER:"mock",NODE_ENV:"production"}),/MOCK_IN_PRODUCTION/);
  assert.throws(()=>moviePublishDriver({MOVIE_PUBLISH_DRIVER:"tiktok"}),/DRIVER_INVALID/);
});

test("mock target records sends, returns numeric id and fake permalink, no network",async()=>{
  const {mockReelTarget}=await import("../src/services/movie-reels/publish-driver");
  const realFetch=globalThis.fetch;let fetched=0;globalThis.fetch=(async()=>{fetched++;throw new Error("no");}) as typeof fetch;
  try{
    const target=mockReelTarget();
    const {deps,params}=harness({publish:target.publish,permalink:target.permalink});
    assert.deepEqual(await publishDueMovieReels(1,deps),{enabled:true,published:1,failed:0});
    const reel=target.log[0];assert.match(reel.id,/^\d+$/);assert.equal(reel.pageId,"1000");
    assert.ok(params.at(-1)!.includes(`https://example.invalid/reel/${reel.id}`));
    assert.equal(fetched,0);
  }finally{globalThis.fetch=realFetch;}
});

test("mock driver still obeys both publishing flags",async()=>{
  process.env.MOVIE_PUBLISH_DRIVER="mock";process.env.MOVIE_REELS_ENABLED="true";delete process.env.MOVIE_REELS_PUBLISHING_ENABLED;
  try{assert.deepEqual(await publishDueMovieReels(1),{enabled:false,published:0,failed:0});}
  finally{delete process.env.MOVIE_PUBLISH_DRIVER;}
});

test("lease runs under the global advisory lock in one transaction",async()=>{
  const {deps,statements}=harness();
  await publishDueMovieReels(1,deps);
  const lock=statements.findIndex(sql=>/pg_advisory_xact_lock/.test(sql));
  assert.ok(lock>0&&/SET status='publishing'/.test(statements[lock+1]));
});

test("send accepted after the lease was swept keeps the reel id and is not counted as published",async()=>{
  const {deps,statements,params}=harness();
  const execute=deps.execute;
  deps.execute=async query=>{const result=await execute(query);return statements.at(-1)!.includes("SET status='published'")?{rows:[]}:result;};
  assert.deepEqual(await publishDueMovieReels(1,deps),{enabled:true,published:0,failed:1});
  assert.match(statements.at(-1)!,/PUBLISHED_AFTER_LEASE_EXPIRED/);assert.ok(params.at(-1)!.includes("555"));
});

test("reel finish errors or missing success flag are outcome-unknown, never a retryable rejection",async()=>{
  const {publishGraphReel}=await import("../src/services/facebook-graph");
  const realFetch=globalThis.fetch,token=process.env.META_PAGE_ACCESS_TOKEN,dbUrl=process.env.DATABASE_URL;
  process.env.META_PAGE_ACCESS_TOKEN="test-token";delete process.env.DATABASE_URL;
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
  const finishWith=(finish:()=>Response)=>{globalThis.fetch=(async(url:string|URL|Request,init?:RequestInit)=>{
    const u=String(url),body=String(init?.body??"");
    if(u.includes("rupload"))return json({success:true});
    if(body.includes("upload_phase=start"))return json({video_id:"777"});
    if(body.includes("upload_phase=finish"))return finish();
    return json({access_token:"page-token"});}) as typeof fetch;};
  try{
    for(const finish of [()=>json({error:{code:2,message:"Unexpected error, please retry"}},500),()=>new Response("<html>bad gateway</html>",{status:502}),()=>json({})]){
      finishWith(finish);
      await assert.rejects(publishGraphReel("1000",Buffer.from("video"),"cap"),(error:Error)=>error.message.startsWith("MCP_PUBLISH_OUTCOME_UNKNOWN")&&error.message.includes("777"));
    }
    finishWith(()=>json({success:true}));
    assert.deepEqual(await publishGraphReel("1000",Buffer.from("video"),"cap"),{id:"777"});
  }finally{
    globalThis.fetch=realFetch;
    if(token===undefined)delete process.env.META_PAGE_ACCESS_TOKEN;else process.env.META_PAGE_ACCESS_TOKEN=token;
    if(dbUrl!==undefined)process.env.DATABASE_URL=dbUrl;
  }
});
