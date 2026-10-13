import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {PgDialect} from "drizzle-orm/pg-core";
import type {SQL} from "drizzle-orm";
import * as P from "../src/services/movie-reels/pipeline";
import {rightsReviewQuery} from "../src/services/movie-reels/rights-review";
import {planReelSchedule,riyadhDay,DAILY_REEL_LIMIT} from "../src/services/movie-reels/policy";

// Executes the real movie SQL against in-process Postgres (PGlite) with the real migrations.
const dialect=new PgDialect();
type Row=Record<string,any>;
const run=async(db:{query:PGlite["query"]},query:SQL)=>{const {sql:text,params}=dialect.sqlToQuery(query);return (await db.query<Row>(text,params as any[])).rows;};
const tx=(db:PGlite,queries:SQL[])=>db.transaction(async t=>{const out=[];for(const q of queries)out.push(await run(t,q));return out;});
const one=async(db:PGlite,text:string,params:any[]=[])=>(await db.query<Row>(text,params)).rows;

async function setup(){
  const db=new PGlite();
  await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL UNIQUE,name text,role text NOT NULL DEFAULT 'viewer',is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE facebook_pages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,facebook_page_id text NOT NULL,platform text NOT NULL DEFAULT 'facebook',access_token_enc text,is_active boolean NOT NULL DEFAULT true);`);
  for(const f of ["0019_movie_reels.sql","0020_movie_rights_reviews.sql","0021_movie_pipeline.sql"])await db.exec(readFileSync(new URL(`../drizzle/${f}`,import.meta.url),"utf8"));
  return db;
}

test("movie pipeline SQL executes end to end against Postgres",async t=>{
  const db=await setup();
  const [admin,reviewer,editor]=(await one(db,`INSERT INTO users(email,role) VALUES('a@x','admin'),('r@x','reviewer'),('e@x','editor') RETURNING id`)).map(r=>r.id as string);
  const page=(await one(db,`INSERT INTO facebook_pages(name,facebook_page_id) VALUES('P','123') RETURNING id`))[0].id as string;
  const allowed=new Set([page]);
  const movie=(await one(db,`INSERT INTO movie_assets(owner_user_id,title,page_id,rights_basis,rights_evidence,facebook_allowed,excerpts_allowed)
    VALUES($1,'فيلم',$2,'licensed','contract #42 signed',true,true) RETURNING id`,[editor,page]))[0].id as string;
  const session=(await one(db,`INSERT INTO movie_upload_sessions(movie_id,owner_user_id,storage_key,provider_upload_id,file_name,size_bytes,mime_type,status)
    VALUES($1,$2,'movies/src.mp4','u1','a.mp4',1000,'video/mp4','completing') RETURNING id`,[movie,editor]))[0].id as string;
  const R={id:reviewer,role:"reviewer"},E={id:editor,role:"editor"},A={id:admin,role:"admin"};
  let job:Row;

  await t.test("finalize upload queues exactly one process job",async()=>{
    await tx(db,P.finalizeUploadQueries(session,movie));
    await tx(db,P.finalizeUploadQueries(session,movie));
    assert.equal((await one(db,`SELECT status,source_storage_key FROM movie_assets WHERE id=$1`,[movie]))[0].status,"queued");
    assert.equal((await one(db,`SELECT count(*)::int n FROM movie_jobs WHERE movie_id=$1`,[movie]))[0].n,1);
  });

  await t.test("lease, expiry re-lease, attempt cap and heartbeat",async()=>{
    [job]=await run(db,P.leaseJobQuery());
    assert.equal(job.kind,"process");assert.equal(job.attempts,1);
    assert.equal((await run(db,P.leaseJobQuery())).length,0,"running job not re-leased");
    await one(db,`UPDATE movie_jobs SET lease_expires_at=now()-interval '1 minute' WHERE id=$1`,[job.id]);
    const [again]=await run(db,P.leaseJobQuery());
    assert.equal(again.id,job.id);assert.equal(again.attempts,2);assert.notEqual(again.lease_token,job.lease_token);
    assert.equal((await run(db,P.heartbeatQuery(job.id,job.lease_token,10))).length,0,"old token rejected");
    job=again;
    assert.equal((await run(db,P.heartbeatQuery(job.id,job.lease_token,10))).length,1);
    assert.equal((await run(db,P.processingStartedQuery(job.id,job.lease_token))).length,1);
    // Exhausted job on another movie is failed, never leased.
    const m2=(await one(db,`INSERT INTO movie_assets(owner_user_id,title,source_storage_key,status) VALUES($1,'m2','k','queued') RETURNING id`,[editor]))[0].id;
    await one(db,`INSERT INTO movie_jobs(movie_id,kind,attempts,idempotency_key) VALUES($1,'process',5,'x')`,[m2]);
    const [res]=await run(db,P.leaseJobQuery());
    assert.equal(res,undefined);
    assert.equal((await one(db,`SELECT status FROM movie_jobs WHERE movie_id=$1`,[m2]))[0].status,"failed");
    assert.equal((await one(db,`SELECT status FROM movie_assets WHERE id=$1`,[m2]))[0].status,"failed");
  });

  let clips:Row[]=[];
  const clipList=async()=>clips=await one(db,`SELECT * FROM movie_clips WHERE movie_id=$1 ORDER BY part_number`,[movie]);
  await t.test("report clips; resume never overwrites an edited clip; complete",async()=>{
    const report=(parts:number[])=>P.reportClipsQuery({jobId:job.id,token:job.lease_token,movieId:movie,movieTitle:"فيلم",
      clips:parts.map(part=>({part,startMs:(part-1)*30000,captions:[{start:0,end:2,text:"مرحبا"}]}))});
    assert.equal((await run(db,report([1,2,3,4,5,6]))).length,6);
    await clipList();
    assert.equal(clips[0].status,"pending_approval");assert.equal(clips[0].output_storage_key,`movies/${movie}/clips/0001/r1.mp4`);
    await run(db,P.editClipQuery({movieId:movie,clipId:clips[0].id,user:E,allowed,edit:{expectedRevision:1,title:"عنوان معدل"}}));
    assert.equal((await run(db,report([1]))).length,0);
    await clipList();
    assert.equal(clips[0].title,"عنوان معدل");assert.equal(clips[0].revision,2);
    const [done]=await run(db,P.completeJobQuery(job.id,job.lease_token));
    assert.equal(done.kind,"process");
    assert.equal((await one(db,`SELECT status FROM movie_assets WHERE id=$1`,[movie]))[0].status,"review_required");
    assert.equal((await run(db,P.completeJobQuery(job.id,job.lease_token))).length,0,"token spent");
  });

  await t.test("caption edit queues one rerender; completion honours revision",async()=>{
    const edit={expectedRevision:1,captions:[{start:0,end:3,text:"نص معدل"}]};
    const [c]=await run(db,P.editClipQuery({movieId:movie,clipId:clips[1].id,user:E,allowed,edit}));
    assert.equal(c.status,"rendering");assert.equal(c.revision,2);assert.equal(Number(c.jobs),1);
    assert.equal((await run(db,P.editClipQuery({movieId:movie,clipId:clips[1].id,user:E,allowed,edit}))).length,0,"stale replay ignored");
    assert.equal((await run(db,P.editClipQuery({movieId:movie,clipId:clips[1].id,user:{id:admin,role:"editor"},allowed,edit:{...edit,expectedRevision:2}}))).length,0,"other editor cannot edit");
    const [rj]=await run(db,P.leaseJobQuery());
    assert.equal(rj.kind,"rerender");assert.equal(rj.clip_id,clips[1].id);
    const [wrong]=await run(db,P.completeJobQuery(rj.id,rj.lease_token,1));
    assert.equal(Number(wrong.clips),0,"older revision leaves clip rendering");
    await clipList();assert.equal(clips[1].status,"rendering");
    // A fresh rerender for the same revision is idempotent (same key) -> requeue the job to finish it properly.
    await one(db,`UPDATE movie_jobs SET status='queued' WHERE id=$1`,[rj.id]);
    const [rj2]=await run(db,P.leaseJobQuery());
    const [ok]=await run(db,P.completeJobQuery(rj2.id,rj2.lease_token,2));
    assert.equal(Number(ok.clips),1);
    await clipList();
    assert.equal(clips[1].status,"pending_approval");assert.equal(clips[1].output_storage_key,`movies/${movie}/clips/0002/r2.mp4`);
    assert.equal((await one(db,`SELECT count(*)::int n FROM movie_jobs WHERE kind='rerender'`))[0].n,1);
  });

  await t.test("review: non-reviewer and stale revisions rejected, then approve",async()=>{
    const items=clips.map(c=>({clipId:c.id,revision:c.revision}));
    assert.equal((await run(db,P.reviewClipsQuery({movieId:movie,user:E,allowed,review:{decision:"approved",items,subtitlesReviewed:true}}))).length,0);
    assert.equal((await run(db,P.reviewClipsQuery({movieId:movie,user:R,allowed,review:{decision:"approved",items:[{clipId:clips[1].id,revision:1}],subtitlesReviewed:true}}))).length,0);
    const rows=await run(db,P.reviewClipsQuery({movieId:movie,user:R,allowed,review:{decision:"approved",items,subtitlesReviewed:true}}));
    assert.equal(rows.length,6);assert.equal(Number(rows[0].audited),6);
  });

  await t.test("rights verification",async()=>{
    const review={decision:"verified",expectedRevision:1,note:"license checked ok",evidenceReviewed:true};
    assert.equal((await run(db,rightsReviewQuery({movieId:movie,reviewerId:editor,allowedPages:allowed,review}))).length,0,"editor cannot verify");
    const [r]=await run(db,rightsReviewQuery({movieId:movie,reviewerId:reviewer,allowedPages:allowed,review}));
    assert.equal(r.rights_status,"verified");assert.equal(r.rights_revision,2);assert.equal(Number(r.audit_count),1);
    assert.equal((await run(db,rightsReviewQuery({movieId:movie,reviewerId:reviewer,allowedPages:allowed,review}))).length,0,"stale revision");
  });

  const pubs=async()=>one(db,`SELECT p.*,c.part_number FROM movie_publications p JOIN movie_clips c ON c.id=p.clip_id WHERE c.movie_id=$1 ORDER BY c.part_number`,[movie]);
  await t.test("schedule: quota violation rolls back, plan respects 5/day, duplicates rejected",async()=>{
    await clipList();
    const day=new Date(Date.now()+3*86_400_000);
    const crowded=clips.map((c,i)=>({clipId:c.id,scheduledAt:new Date(day.getTime()+i*60_000)}));
    await assert.rejects(tx(db,P.reserveScheduleQueries({movieId:movie,pageId:page,slots:crowded})),/division by zero/);
    assert.equal((await pubs()).length,0,"whole transaction rolled back");
    assert.equal((await one(db,`SELECT count(*)::int n FROM movie_clips WHERE status='scheduled'`))[0].n,0);
    const m=(await one(db,`SELECT * FROM movie_assets WHERE id=$1`,[movie]))[0];
    const plan=planReelSchedule({rights:{status:m.rights_status,verifiedBy:m.rights_verified_by,verifiedAt:new Date(m.rights_verified_at).toISOString(),expiresAt:null,facebookAllowed:true,excerptsAllowed:true},
      clips:clips.map(c=>({id:c.id,part:c.part_number,durationMs:c.duration_ms,approvedBy:c.approved_by,approvedAt:new Date(c.approved_at).toISOString(),status:c.status,outputKey:c.output_storage_key,subtitleReviewed:c.subtitle_reviewed})),
      pageId:page,allowedPages:allowed,start:new Date(Date.now()+3_600_000),reservations:(await run(db,P.reservationsQuery(page))).map(r=>({clipId:r.clip_id,pageId:r.page_id,scheduledAt:new Date(r.scheduled_at)}))});
    assert.equal(plan.length,6);
    const perDay=new Map<string,number>();for(const s of plan)perDay.set(riyadhDay(s.scheduledAt),(perDay.get(riyadhDay(s.scheduledAt))??0)+1);
    assert.ok([...perDay.values()].every(n=>n<=DAILY_REEL_LIMIT));
    const res=await tx(db,P.reserveScheduleQueries({movieId:movie,pageId:page,slots:plan}));
    assert.equal(res.at(-1)![0].ok,1);
    assert.equal((await pubs()).filter(p=>p.status==="scheduled").length,6);
    await assert.rejects(tx(db,P.reserveScheduleQueries({movieId:movie,pageId:page,slots:plan.slice(0,1)})),/duplicate key/);
    assert.equal((await pubs()).length,6);
  });

  await t.test("publishing: order, quota, results, retry, sweep",async()=>{
    const due=(part:number,ago="1 minute")=>one(db,`UPDATE movie_publications p SET scheduled_at=now()-$2::interval FROM movie_clips c WHERE c.id=p.clip_id AND c.movie_id=$1 AND c.part_number=$3`,[movie,ago,part]);
    await due(2);
    assert.equal((await run(db,P.leasePublicationQuery())).length,0,"part 2 waits for part 1");
    await due(1,"2 minutes");
    const [p1]=await run(db,P.leasePublicationQuery());
    assert.equal(p1.part_number,1);assert.equal(p1.facebook_page_id,"123");
    assert.equal((await run(db,P.leasePublicationQuery())).length,0,"part 2 waits while part 1 is publishing");
    assert.equal((await run(db,P.publishedQuery(p1.id,p1.lease_token,"1111111","https://fb/r"))).length,1);
    // Quota: 4 extra reels already published today on this page -> 5 total blocks part 2.
    const other=(await one(db,`INSERT INTO movie_assets(owner_user_id,title) VALUES($1,'o') RETURNING id`,[editor]))[0].id;
    await one(db,`WITH c AS (INSERT INTO movie_clips(movie_id,part_number,start_ms) SELECT $1,g,0 FROM generate_series(1,4) g RETURNING id)
      INSERT INTO movie_publications(clip_id,page_id,revision,scheduled_at,status,published_at) SELECT id,$2,1,now(),'published',now() FROM c`,[other,page]);
    assert.equal((await run(db,P.leasePublicationQuery())).length,0,"daily quota reached");
    await one(db,`UPDATE movie_publications SET published_at=now()-interval '3 days' WHERE clip_id IN (SELECT id FROM movie_clips WHERE movie_id=$1)`,[other]);
    let [p2]=await run(db,P.leasePublicationQuery());
    assert.equal(p2.part_number,2);
    const [rej]=await run(db,P.publishFailedQuery(p2.id,p2.lease_token,"GRAPH_400","rejected"));
    assert.equal(rej.status,"scheduled");
    assert.ok(new Date((await pubs())[1].scheduled_at).getTime()>Date.now()+10*60_000,"backoff");
    await due(2);
    [p2]=await run(db,P.leasePublicationQuery());
    assert.equal(p2.attempts,2);
    const [unk]=await run(db,P.publishFailedQuery(p2.id,p2.lease_token,"TIMEOUT","unknown"));
    assert.equal(unk.status,"outcome_unknown");
    assert.equal((await run(db,P.leasePublicationQuery())).length,0,"unknown outcome blocks later parts");
    assert.equal((await run(db,P.publicationActionQuery({movieId:movie,publicationId:p2.id,user:E,allowed:new Set<string>(),body:{action:"retry",checkedPage:true}}))).length,0,"out of scope");
    const [retry]=await run(db,P.publicationActionQuery({movieId:movie,publicationId:p2.id,user:A,allowed:null,body:{action:"retry",checkedPage:true}}));
    assert.equal(retry.status,"scheduled");
    assert.equal((await pubs())[1].attempts,0);
    [p2]=await run(db,P.leasePublicationQuery());
    assert.equal(p2.part_number,2);
    // Abandoned lease -> outcome_unknown; due clip whose revision changed -> cancelled and reset.
    await one(db,`UPDATE movie_publications SET lease_expires_at=now()-interval '1 minute' WHERE id=$1`,[p2.id]);
    await due(3);
    await one(db,`UPDATE movie_clips SET revision=revision+1 WHERE movie_id=$1 AND part_number=3`,[movie]);
    const [sw]=await run(db,P.sweepPublicationsQuery());
    assert.equal(Number(sw.cancelled),1);assert.equal(Number(sw.stale),1);
    const list=await pubs();
    assert.equal(list[1].status,"outcome_unknown");assert.equal(list[2].status,"cancelled");
    assert.equal((await one(db,`SELECT status FROM movie_clips WHERE movie_id=$1 AND part_number=3`,[movie]))[0].status,"approved");
  });

  await t.test("rights revocation cancels scheduled reels and clears approvals",async()=>{
    const [r]=await run(db,rightsReviewQuery({movieId:movie,reviewerId:reviewer,allowedPages:allowed,review:{decision:"revoked",expectedRevision:2,note:"license withdrawn",evidenceReviewed:true}}));
    assert.equal(r.rights_status,"revoked");
    const list=await pubs();
    assert.deepEqual(list.slice(3).map(p=>p.status),["cancelled","cancelled","cancelled"]);
    assert.equal(list[0].status,"published");
    const states=(await one(db,`SELECT status FROM movie_clips WHERE movie_id=$1 ORDER BY part_number`,[movie])).map(r=>r.status);
    assert.deepEqual(states,["published",...Array(5).fill("pending_approval")]);
    assert.equal(list[1].status,"outcome_unknown","unknown outcome kept for a human check");
    assert.equal((await run(db,P.leasePublicationQuery())).length,0);
  });
  await db.close();
});


test("recovery paths: exhausted rerender, withdrawn clips, per-page quota, serialized lease",async t=>{
  const db=await setup();
  const [admin,reviewer]=(await one(db,`INSERT INTO users(email,role) VALUES('a@x','admin'),('r@x','reviewer') RETURNING id`)).map(r=>r.id as string);
  const [pageA,pageB]=(await one(db,`INSERT INTO facebook_pages(name,facebook_page_id) VALUES('A','1'),('B','2') RETURNING id`)).map(r=>r.id as string);
  const A={id:admin,role:"admin"},R={id:reviewer,role:"reviewer"};
  const movieOn=async(page:string)=>(await one(db,`INSERT INTO movie_assets(owner_user_id,title,page_id,source_storage_key,rights_status,facebook_allowed,excerpts_allowed)
    VALUES($1,'m',$2,'k','verified',true,true) RETURNING id`,[admin,page]))[0].id as string;
  const clip=async(movie:string,part:number,status="scheduled")=>(await one(db,`INSERT INTO movie_clips(movie_id,part_number,start_ms,status,approved_by,approved_at,subtitle_reviewed,output_storage_key)
    VALUES($1,$2,0,$3,$4,now(),true,'movies/x/clips/0001/r1.mp4') RETURNING id`,[movie,part,status,reviewer]))[0].id as string;
  const pub=async(clipId:string,page:string,status="scheduled",ago="1 minute")=>(await one(db,`INSERT INTO movie_publications(clip_id,page_id,revision,scheduled_at,status)
    VALUES($1,$2,1,now()-$4::interval,$3) RETURNING id`,[clipId,page,status,ago]))[0].id as string;
  const status=async(table:string,id:string)=>(await one(db,`SELECT status FROM ${table} WHERE id=$1`,[id]))[0].status;

  await t.test("exhausted rerender marks the clip render_failed so it can be edited again",async()=>{
    const movie=await movieOn(pageA),c=await clip(movie,1,"rendering");
    await one(db,`INSERT INTO movie_jobs(movie_id,clip_id,kind,attempts,status,lease_expires_at,idempotency_key) VALUES($1,$2,'rerender',5,'running',now()-interval '1 minute','r')`,[movie,c]);
    await run(db,P.leaseJobQuery());
    assert.equal(await status("movie_clips",c),"render_failed");
    assert.equal((await run(db,P.editClipQuery({movieId:movie,clipId:c,user:A,allowed:null,edit:{expectedRevision:1,title:"x"}}))).length,1);
  });

  await t.test("process job cannot re-sign writes over reported clips",async()=>{
    const movie=await movieOn(pageA);await clip(movie,1,"approved");await clip(movie,2,"processing");
    assert.deepEqual((await run(db,P.lockedClipPartsQuery(movie,[1,2,3,1]))).map(r=>r.part_number),[1]);
  });

  await t.test("cancel/retry never overwrite a rejected clip; rejection clears failed publications",async()=>{
    const movie=await movieOn(pageA),c1=await clip(movie,1),c2=await clip(movie,2);
    const p1=await pub(c1,pageA,"outcome_unknown"),p2=await pub(c2,pageA,"failed");
    const [rej]=await run(db,P.reviewClipsQuery({movieId:movie,user:R,allowed:null,review:{decision:"rejected",items:[{clipId:c1,revision:1},{clipId:c2,revision:1}],subtitlesReviewed:false}}));
    assert.equal(Number(rej.cancelled),1);
    assert.equal(await status("movie_publications",p2),"cancelled","failed row no longer blocks reschedule or later parts");
    assert.equal(await status("movie_publications",p1),"outcome_unknown","unknown outcome kept for a human check");
    assert.equal((await run(db,P.publicationActionQuery({movieId:movie,publicationId:p1,user:A,allowed:null,body:{action:"retry",checkedPage:true}}))).length,0,"retry of a rejected clip refused");
    const [cancel]=await run(db,P.publicationActionQuery({movieId:movie,publicationId:p1,user:A,allowed:null,body:{action:"cancel",checkedPage:true}}));
    assert.equal(cancel.status,"cancelled");assert.equal(Number(cancel.clips),0);
    assert.equal(await status("movie_clips",c1),"rejected");
    // Re-approve part 2 and reschedule: the old failed row no longer collides.
    await run(db,P.reviewClipsQuery({movieId:movie,user:R,allowed:null,review:{decision:"approved",items:[{clipId:c2,revision:1}],subtitlesReviewed:true}}));
    const res=await tx(db,P.reserveScheduleQueries({movieId:movie,pageId:pageA,slots:[{clipId:c2,scheduledAt:new Date(Date.now()+86_400_000)}]}));
    assert.equal(res.at(-1)![0].ok,1);
    await one(db,`UPDATE movie_publications SET status='cancelled' WHERE page_id=$1`,[pageA]);
  });

  await t.test("a page over quota does not block other pages; lease takes the global lock",async()=>{
    const filler=await movieOn(pageA);
    for(let i=1;i<=5;i++)await pub(await clip(filler,i,"published"),pageA,"published","0 minutes");
    const mA=await movieOn(pageA),mB=await movieOn(pageB);
    await pub(await clip(mA,1),pageA,"scheduled","10 minutes");
    const pB=await pub(await clip(mB,1),pageB,"scheduled","1 minute");
    const out=await tx(db,P.leasePublicationQueries());
    assert.equal(out.at(-1)![0].id,pB,"page B leased although page A's older reel is over quota");
    assert.match(dialect.sqlToQuery(P.leasePublicationQueries()[0]).sql,/pg_advisory_xact_lock/);
  });

  await t.test("lease lost mid-send keeps the Meta reel id on the outcome_unknown row",async()=>{
    const movie=await movieOn(pageB),c=await clip(movie,2);
    const p=await pub(c,pageB,"outcome_unknown");
    assert.equal((await run(db,P.publishedAfterLeaseLostQuery(p,"99999999",null))).length,1);
    assert.equal((await one(db,`SELECT remote_reel_id FROM movie_publications WHERE id=$1`,[p]))[0].remote_reel_id,"99999999");
    assert.equal((await run(db,P.publicationActionQuery({movieId:movie,publicationId:p,user:A,allowed:null,body:{action:"retry",checkedPage:true}}))).length,0,"no blind retry once Meta returned an id");
  });
  await db.close();
});
