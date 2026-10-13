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
      if(q.sql.includes("SET status='publishing'"))return {rows:queue.length?[queue.shift()]:[]};return {rows:[]};},
    clipBytes:async()=>Buffer.from("0000ftypisom"),publish:async()=>({id:"555"}),permalink:async()=>"https://www.facebook.com/reel/555",...overrides};
  return {deps,statements,params};
}

test("publishing is off unless the separate publishing flag is set",async()=>{
  delete process.env.MOVIE_REELS_PUBLISHING_ENABLED;process.env.MOVIE_REELS_ENABLED="true";
  assert.equal(moviePublishingEnabled(),false);
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
