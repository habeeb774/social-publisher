import {strict as assert} from "node:assert";
import {test} from "node:test";
import {PgDialect} from "drizzle-orm/pg-core";
import type {SQL} from "drizzle-orm";
import {clipEditSchema,clipReviewSchema,completeJobQuery,editClipQuery,failJobQuery,finalizeUploadQueries,leaseJobQuery,leasePublicationQuery,movieScope,
  publicationActionSchema,publishFailedQuery,reportClipsQuery,reserveScheduleQueries,reviewClipsQuery,sweepPublicationsQuery,workerCaptionSchema} from "../src/services/movie-reels/pipeline";
import {clipOutputKey,validateClipKey} from "../src/services/movie-reels/upload-policy";

const id="12345678-1234-4123-8123-123456789012",other="22345678-1234-4123-8123-123456789012";
const q=(query:SQL)=>new PgDialect().sqlToQuery(query);
const admin={id,role:"admin"},editor={id,role:"editor"},reviewer={id,role:"reviewer"};

test("scope: admin all, reviewer by page, editor by page and ownership",()=>{
  assert.equal(q(movieScope(admin,new Set())).sql,"true");
  assert.match(q(movieScope(reviewer,new Set([other]))).sql,/m\.page_id IN/);
  assert.doesNotMatch(q(movieScope(reviewer,null)).sql,/owner_user_id/);
  const scoped=q(movieScope(editor,new Set()));
  assert.match(scoped.sql,/false AND m\.owner_user_id=/);
});

test("clip storage keys are server-derived and confined to the movie prefix",()=>{
  assert.equal(clipOutputKey(id,3,"base"),`movies/${id}/clips/0003/base.mp4`);
  assert.equal(clipOutputKey(id,3,2),`movies/${id}/clips/0003/r2.mp4`);
  assert.throws(()=>clipOutputKey(id,0,"base"));
  assert.throws(()=>validateClipKey(`movies/${id}/clips/0003/r2.mp4`,other));
  assert.throws(()=>validateClipKey(`movies/${id}/clips/../../sources/x`));
});

test("upload finalization queues exactly one idempotent processing job",()=>{
  const [session,movie,job]=finalizeUploadQueries(id,other).map(q);
  assert.match(session.sql,/status='completing'/);
  assert.match(movie.sql,/source_storage_key IS NULL/);
  assert.match(job.sql,/ON CONFLICT\(idempotency_key\) DO NOTHING/);
  assert.match(job.sql,/'process:'\|\|id::text/);
});

test("worker lease skips locked jobs, caps attempts, and refuses rejected rights",()=>{
  const lease=q(leaseJobQuery());
  assert.match(lease.sql,/FOR UPDATE OF j SKIP LOCKED/);
  assert.match(lease.sql,/rights_status IN \('pending','verified'\)/);
  assert.match(lease.sql,/lease_expires_at<now\(\)/);
  assert.ok(lease.params.includes(5));
});

test("resumed processing never overwrites a clip a human may have edited",()=>{
  const report=q(reportClipsQuery({jobId:id,token:other,movieId:id,movieTitle:"فيلم",clips:[{part:1,startMs:0,captions:[{start:0,end:2,text:"مرحبا"}]}]}));
  assert.match(report.sql,/WHERE movie_clips\.status='processing' AND movie_clips\.revision=1/);
  assert.match(report.sql,/j\.lease_token=/);
  const rows=JSON.parse(String(report.params.find(p=>typeof p==="string"&&p.startsWith("["))));
  assert.equal(rows[0].output,`movies/${id}/clips/0001/r1.mp4`);
  assert.equal(rows[0].title,"فيلم - الجزء 1");
});

test("re-render completes only the revision it was leased for; failures are bounded",()=>{
  assert.match(q(completeJobQuery(id,other,4)).sql,/c\.revision=\$\d+ AND \$\d+>0/);
  const fail=q(failJobQuery(id,other,"x".repeat(900),true));
  assert.match(fail.sql,/j\.attempts<\$\d+ THEN 'queued' ELSE 'failed'/);
  assert.ok(fail.params.some(p=>typeof p==="string"&&p.length===500));
});

test("caption validation rejects overlap, out-of-clip times and empty text",()=>{
  assert.equal(workerCaptionSchema.safeParse([{start:0,end:2,text:"أ"},{start:2,end:4,text:"ب"}]).success,true);
  for(const bad of [[{start:0,end:3,text:"أ"},{start:2,end:4,text:"ب"}],[{start:29,end:31,text:"أ"}],[{start:1,end:1,text:"أ"}],[{start:0,end:1,text:" "}]])
    assert.equal(workerCaptionSchema.safeParse(bad).success,false);
});

test("any clip edit bumps revision and clears approval; caption edits queue re-render",()=>{
  assert.equal(clipEditSchema.safeParse({expectedRevision:1}).success,false);
  const edit=q(editClipQuery({movieId:id,clipId:other,user:editor,allowed:null,edit:{expectedRevision:2,captions:[{start:0,end:1,text:"نص"}]}}));
  assert.match(edit.sql,/revision=c\.revision\+1/);
  assert.match(edit.sql,/approved_by=NULL,approved_at=NULL,subtitle_reviewed=false/);
  assert.match(edit.sql,/'rerender'/);
  assert.doesNotMatch(edit.sql,/'scheduled'/);
});

test("review requires subtitle confirmation, binds revisions and withdraws schedules",()=>{
  const items=[{clipId:other,revision:2}];
  assert.equal(clipReviewSchema.safeParse({decision:"approved",items,subtitlesReviewed:false}).success,false);
  assert.equal(clipReviewSchema.safeParse({decision:"excluded",items,subtitlesReviewed:false}).success,true);
  const review=q(reviewClipsQuery({movieId:id,user:reviewer,allowed:null,review:{decision:"approved",items,subtitlesReviewed:true}}));
  assert.match(review.sql,/c\.revision=v\.revision/);
  assert.match(review.sql,/u\.role IN \('admin','reviewer'\)/);
  assert.match(review.sql,/INSERT INTO movie_approvals/);
  assert.match(review.sql,/UPDATE movie_publications p SET status='cancelled'/);
});

test("schedule reservation is locked per page and aborts on quota or missing rows",()=>{
  const at=new Date(Date.now()+3600_000);
  const [lock,cleanup,insert,clips,guard]=reserveScheduleQueries({movieId:id,pageId:other,slots:[{clipId:id,scheduledAt:at}]}).map(q);
  assert.match(lock.sql,/pg_advisory_xact_lock/);
  assert.match(cleanup.sql,/status='cancelled'/);
  assert.match(insert.sql,/m\.rights_status='verified'/);
  assert.match(insert.sql,/c\.subtitle_reviewed/);
  assert.match(insert.sql,/m\.rights_expires_at>v\.at/);
  assert.match(clips.sql,/status='scheduled'/);
  assert.match(guard.sql,/1\/\(CASE WHEN/);
  assert.match(guard.sql,/HAVING count\(\*\)>\$\d+/);
  assert.ok(guard.params.includes(5)&&guard.params.includes("Asia/Riyadh"));
  assert.throws(()=>reserveScheduleQueries({movieId:id,pageId:other,slots:[]}));
});

test("publish lease rechecks rights, review, page, order and Riyadh daily quota",()=>{
  const lease=q(leasePublicationQuery());
  for(const pattern of [/m\.rights_status='verified'/,/c\.revision=p\.revision/,/fp\.is_active/,/c2\.part_number<c\.part_number/,/SKIP LOCKED/,/AT TIME ZONE/])assert.match(lease.sql,pattern);
  assert.ok(lease.params.includes(5));
  const sweep=q(sweepPublicationsQuery());
  assert.match(sweep.sql,/status='outcome_unknown'/);
  assert.match(sweep.sql,/RIGHTS_OR_REVIEW_INVALID/);
});

test("graph rejections retry with backoff; unknown outcomes never auto-retry",()=>{
  const failed=q(publishFailedQuery(id,other,"FACEBOOK_GRAPH_ERROR","unknown"));
  assert.match(failed.sql,/THEN 'outcome_unknown'/);
  assert.match(failed.sql,/make_interval\(mins=>15\*attempts\)/);
  assert.equal(publicationActionSchema.safeParse({action:"retry"}).success,false);
  assert.equal(publicationActionSchema.safeParse({action:"mark_published",checkedPage:true}).success,false);
  assert.equal(publicationActionSchema.safeParse({action:"retry",checkedPage:true}).success,true);
});
