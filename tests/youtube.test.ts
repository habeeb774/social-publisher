import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {PgDialect} from "drizzle-orm/pg-core";
import type {SQL} from "drizzle-orm";
import {authorizationUrl,hashState,newOAuthPair,uploadVideo,videoBody,videoStatus,YouTubeError} from "../src/services/youtube/google";
import {checkYouTubeLease,finishYouTube,leaseYouTubeQueries,planYouTube,reserveYouTubeQueries,youtubeRightsQuery} from "../src/services/youtube/pipeline";
import {publishDueYouTube,youtubePublishingEnabled} from "../src/services/youtube/publisher";

const dialect=new PgDialect();
const run=async(db:Pick<PGlite,"query">,query:SQL)=>{const q=dialect.sqlToQuery(query);return (await db.query<Record<string,unknown>>(q.sql,q.params)).rows;};
const transaction=(db:PGlite,queries:SQL[])=>db.transaction(async tx=>{let rows:Record<string,unknown>[]=[];for(const q of queries)rows=await run(tx,q);return rows;});
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
const meta={title:"مقطع",description:"تجربة",privacy:"private" as const,madeForKids:false,syntheticMedia:false};

test("OAuth uses offline consent, narrow scopes and PKCE, never exposes the client secret",()=>{
 const saved={id:process.env.YOUTUBE_CLIENT_ID,secret:process.env.YOUTUBE_CLIENT_SECRET,uri:process.env.YOUTUBE_REDIRECT_URI};
 process.env.YOUTUBE_CLIENT_ID="test-client";process.env.YOUTUBE_CLIENT_SECRET="test-secret";process.env.YOUTUBE_REDIRECT_URI="https://example.com/api/youtube/callback";
 try{const pair=newOAuthPair(),url=new URL(authorizationUrl(pair.state,pair.verifier));
  assert.equal(url.origin,"https://accounts.google.com");assert.equal(url.searchParams.get("access_type"),"offline");assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.equal(url.searchParams.get("scope")?.split(" ").length,2);assert.equal(url.searchParams.get("state"),pair.state);
  assert.ok(!url.href.includes("test-secret"));assert.notEqual(hashState(pair.state),pair.state);assert.notEqual(newOAuthPair().state,pair.state);
 }finally{for(const [key,value] of Object.entries({YOUTUBE_CLIENT_ID:saved.id,YOUTUBE_CLIENT_SECRET:saved.secret,YOUTUBE_REDIRECT_URI:saved.uri})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test("metadata explicitly sets visibility and child/synthetic declarations",()=>{
 const value=videoBody({...meta,title:"<bad>"+"x".repeat(120)});assert.equal(value.status.privacyStatus,"private");assert.equal(value.status.selfDeclaredMadeForKids,false);
 assert.equal(value.status.containsSyntheticMedia,false);assert.equal(value.snippet.title.length,100);assert.ok(!value.snippet.title.includes("<"));
 assert.ok(Buffer.byteLength(videoBody({...meta,description:"ع".repeat(5000)}).snippet.description,"utf8")<=5000);
});
test("resumable upload sends session then media once and validates returned id",async()=>{
 const calls:string[]=[];
 const fake:typeof fetch=async(input,options)=>{calls.push(String(input));return options?.method==="POST"?new Response(null,{status:200,headers:{location:"https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test"}}):reply({id:"abcdefghijk"});};
 assert.deepEqual(await uploadVideo("token",Buffer.from("video"),meta,fake),{id:"abcdefghijk"});assert.equal(calls.length,2);
});
test("an untrusted resumable URL never receives bytes or bearer credentials",async()=>{
 let calls=0;const fake:typeof fetch=async()=>{calls++;return new Response(null,{status:200,headers:{location:"https://attacker.invalid/upload/youtube/v3/videos"}});};
 await assert.rejects(uploadVideo("token",Buffer.from("video"),meta,fake),/YOUTUBE_UPLOAD_URL_INVALID/);assert.equal(calls,1);
});
test("approval is rechecked between session creation and media PUT",async()=>{
 let calls=0;const fake:typeof fetch=async()=>{calls++;return new Response(null,{status:200,headers:{location:"https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test"}});};
 await assert.rejects(uploadVideo("token",Buffer.from("video"),meta,fake,async()=>false),/YOUTUBE_APPROVAL_WITHDRAWN/);assert.equal(calls,1);
});
test("media timeouts and malformed successes are unknown, never automatically retried",async()=>{
 for(const fail of [async()=>{throw new Error("timeout");},async()=>reply({})]){
  let calls=0;const fake:typeof fetch=async()=>{calls++;return calls===1?new Response(null,{status:200,headers:{location:"https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test"}}):fail();};
  await assert.rejects(uploadVideo("token",Buffer.from("video"),meta,fake),(e:unknown)=>e instanceof YouTubeError&&e.outcome==="unknown");assert.equal(calls,2);
 }
});
test("processing and private videos are not labeled publicly published",async()=>{
 for(const [uploadStatus,privacyStatus,expected] of [["uploaded","public","processing"],["processed","private","private"],["processed","unlisted","unlisted"],["processed","public","published"]]){
  const fake:typeof fetch=async()=>reply({items:[{snippet:{channelId:"UCtest"},status:{uploadStatus,privacyStatus}}]});
  assert.equal(await videoStatus("token","abcdefghijk","UCtest",fake),expected);
 }
 await assert.rejects(videoStatus("token","abcdefghijk","another",async()=>reply({items:[{snippet:{channelId:"UCtest"}}]})),/CHANNEL_MISMATCH/);
});
test("YouTube needs its own rights consent and obeys Riyadh quota; Facebook published clips remain usable",()=>{
 const now=new Date("2026-10-14T00:00:00Z"),start=new Date("2026-10-14T01:00:00Z");
 const rights={status:"verified",verifiedBy:"reviewer",verifiedAt:now.toISOString(),expiresAt:null,facebookAllowed:false,excerptsAllowed:true};
 const clips=Array.from({length:6},(_,i)=>({id:String(i),part:i+1,durationMs:30000,approvedBy:"reviewer",approvedAt:now.toISOString(),status:"published",outputKey:"key",subtitleReviewed:true}));
 assert.throws(()=>planYouTube({rights,youtubeVerified:false,clips,channelId:"channel",start,now,reservations:[]}),/YOUTUBE_RIGHTS_REQUIRED/);
 const plan=planYouTube({rights,youtubeVerified:true,clips,channelId:"channel",start,now,reservations:[]});assert.equal(plan.length,6);
 assert.ok(plan[5].scheduledAt.getTime()-plan[0].scheduledAt.getTime()>=86400000);
});

test("YouTube SQL: independent schedules, atomic quota, cancellation, revision gates and uncertain leases",async t=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,name text,role text,is_active boolean DEFAULT true);
   CREATE TABLE facebook_pages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,facebook_page_id text,platform text DEFAULT 'facebook',is_active boolean DEFAULT true);`);
  for(const file of ["0019_movie_reels.sql","0020_movie_rights_reviews.sql","0021_movie_pipeline.sql","0024_movie_youtube.sql"])await db.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),"utf8"));
  const user=String((await db.query<{id:string}>("INSERT INTO users(email,role) VALUES('admin@test','admin') RETURNING id")).rows[0].id);
  const page=(await db.query<{id:string}>("INSERT INTO facebook_pages(name,facebook_page_id) VALUES('FB','123') RETURNING id")).rows[0].id;
  const movie=(await db.query<{id:string}>(`INSERT INTO movie_assets(owner_user_id,title,page_id,rights_status,rights_verified_by,rights_verified_at,excerpts_allowed,facebook_allowed,source_storage_key,status)
   VALUES($1,'movie',$2,'verified',$1,now(),true,true,'source','review_required') RETURNING id`,[user,page])).rows[0].id;
  const channel=(await db.query<{id:string}>("INSERT INTO youtube_channels(owner_user_id,channel_id,title,refresh_token_enc) VALUES($1,'UCtest','channel','encrypted') RETURNING id",[user])).rows[0].id;
  const scope={user:{id:user,role:"admin"},allowed:null};
  const clips=(await db.query<{id:string}>(`INSERT INTO movie_clips(movie_id,part_number,start_ms,duration_ms,status,approved_by,approved_at,subtitle_reviewed,output_storage_key)
   SELECT $1,n,(n-1)*30000,30000,'published',$2,now(),true,'key'||n FROM generate_series(1,6) n RETURNING id`,[movie,user])).rows.map(c=>c.id);
  for(const clip of clips)await db.query("INSERT INTO movie_approvals(clip_id,revision,reviewer_id,decision) VALUES($1,1,$2,'approved')",[clip,user]);
  const input={channelId:channel,start:new Date(Date.now()+3600000).toISOString(),privacy:"private" as const,madeForKids:false,syntheticMedia:false};
  const slots=clips.map(clipId=>({clipId,scheduledAt:new Date(Date.now()+3600000)}));
  const count=async()=>Number((await db.query<{n:number}>("SELECT count(*)::int n FROM movie_youtube_publications")).rows[0].n);
  await t.test("Facebook rights alone cannot reserve YouTube uploads",async()=>{await assert.rejects(transaction(db,reserveYouTubeQueries(movie,scope,input,slots.slice(0,1))));assert.equal(await count(),0);});
  await t.test("review is evidence-backed and recorded separately",async()=>{
   const result=await run(db,youtubeRightsQuery(movie,scope,{decision:"verified",expectedRevision:1,evidence:"contract permits YouTube excerpts",youtubeAllowed:true,excerptsAllowed:true,evidenceReviewed:true}));assert.equal(result.length,1);
   assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM movie_youtube_rights_history")).rows[0].n,1);
  });
  await t.test("six same-day slots roll back; five reserve without changing Facebook clips",async()=>{
   await assert.rejects(transaction(db,reserveYouTubeQueries(movie,scope,input,slots)));assert.equal(await count(),0);
   await transaction(db,reserveYouTubeQueries(movie,scope,input,slots.slice(0,5)));assert.equal(await count(),5);
   assert.equal((await db.query<{status:string}>("SELECT status FROM movie_clips LIMIT 1")).rows[0].status,"published");
  });
  await t.test("duplicates cannot be reinserted",async()=>{await assert.rejects(transaction(db,reserveYouTubeQueries(movie,scope,input,slots.slice(0,1))));assert.equal(await count(),5);});
  await t.test("clip edits cancel pending YouTube schedules",async()=>{
   await db.query("UPDATE movie_clips SET revision=2,approved_by=NULL WHERE id=$1",[clips[0]]);
   assert.equal((await db.query<{status:string}>("SELECT status FROM movie_youtube_publications WHERE clip_id=$1",[clips[0]])).rows[0].status,"cancelled");
  });
  await t.test("leasing excludes unapproved clips and locks a channel",async()=>{
   await db.query("UPDATE movie_youtube_publications SET scheduled_at=now()-interval '1 minute'");
   const [job]=await transaction(db,leaseYouTubeQueries());assert.ok(job);assert.notEqual(job.clip_id,clips[0]);
   assert.equal((await transaction(db,leaseYouTubeQueries())).length,0);assert.equal((await run(db,checkYouTubeLease(String(job.id),String(job.lease_token)))).length,1);
   await assert.rejects(db.query("UPDATE movie_assets SET status='deleting' WHERE id=$1",[movie]),/MOVIE_YOUTUBE_DELETE_NOT_ALLOWED/);
   await run(db,finishYouTube(String(job.id),String(job.lease_token),{videoId:"abcdefghijk"}));
   assert.equal((await db.query<{status:string}>("SELECT status FROM movie_youtube_publications WHERE id=$1",[job.id])).rows[0].status,"processing");
  });
  await t.test("expired uploads become unknown rather than leased again",async()=>{
   await db.query("UPDATE movie_youtube_publications SET status='published' WHERE status='processing'");
   const [job]=await transaction(db,leaseYouTubeQueries());assert.ok(job);
   await db.query("UPDATE movie_youtube_publications SET lease_expires_at=now()-interval '1 minute' WHERE id=$1",[job.id]);
   await transaction(db,leaseYouTubeQueries());
   assert.equal((await db.query<{status:string}>("SELECT status FROM movie_youtube_publications WHERE id=$1",[job.id])).rows[0].status,"outcome_unknown");
  });
  await t.test("revoking original rights removes YouTube consent and cancels all pending slots",async()=>{
   await db.query("UPDATE movie_assets SET rights_revision=rights_revision+1,rights_status='revoked' WHERE id=$1",[movie]);
   assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM movie_youtube_rights")).rows[0].n,0);
   assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM movie_youtube_publications WHERE status='scheduled'")).rows[0].n,0);
  });
 }finally{await db.close();}
});
test("publishing is independently disabled by default",async()=>{
 const old=process.env.MOVIE_YOUTUBE_PUBLISHING_ENABLED;delete process.env.MOVIE_YOUTUBE_PUBLISHING_ENABLED;
 try{assert.equal(youtubePublishingEnabled(),false);assert.deepEqual(await publishDueYouTube(),{enabled:false,uploaded:0,failed:0});}
 finally{if(old!==undefined)process.env.MOVIE_YOUTUBE_PUBLISHING_ENABLED=old;}
});
test("publisher stores an accepted ID as processing, and uncertain uploads never become retryable failures",async()=>{
 const id="11111111-1111-4111-8111-111111111111",token="22222222-2222-4222-8222-222222222222";
 for(const outcome of ["success","unknown","storage","db-after-upload"]){
  const updates:string[]=[];let uploads=0,finishFailed=false;
  const result=await publishDueYouTube({
   execute:async q=>{const statement=dialect.sqlToQuery(q);
    if(statement.sql.startsWith("UPDATE")){if(outcome==="db-after-upload"&&!finishFailed){finishFailed=true;throw new Error("db disconnected");}
     updates.push(String(statement.params[0]));return {rows:[{id}]};}
    return {rows:statement.sql.startsWith("SELECT p.id FROM")?[{id}]:[]};},
   transaction:async()=>[{id,lease_token:token,title:"title",description:"desc",output_storage_key:"key",refresh_token_enc:"encrypted",google_channel_id:"UCtest",privacy:"private",made_for_kids:false,synthetic_media:false}],
   bytes:async()=>{if(outcome==="storage")throw new Error("storage down");return Buffer.from("video");},
   access:async()=>"token",channel:async()=>({id:"UCtest"}),
   upload:async()=>{uploads++;if(outcome==="unknown")throw new YouTubeError("TIMEOUT","unknown");return {id:"abcdefghijk"};},
   status:async()=>"processing",
  });
  assert.equal(uploads,outcome==="storage"?0:1);assert.equal(result.uploaded,outcome==="success"?1:0);
  assert.deepEqual(updates,[outcome==="success"?"processing":outcome==="storage"?"failed":"outcome_unknown"]);
 }
});
