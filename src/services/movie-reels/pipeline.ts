import {sql,type SQL} from "drizzle-orm";
import {PgDialect} from "drizzle-orm/pg-core";
import {neon} from "@neondatabase/serverless";
import {z} from "zod";
import {DAILY_REEL_LIMIT,REEL_TIME_ZONE} from "./policy";
import {clipOutputKey} from "./upload-policy";
import {catalogPublicationGate} from "./catalog";

/** Every movie statement is a single atomic SQL statement, or a non-interactive transaction below. */
export const MAX_JOB_ATTEMPTS=5;
export const MAX_PUBLISH_ATTEMPTS=3;
const uuid=(value:string)=>z.uuid().parse(value);
const uuidList=(ids:string[])=>sql.join(ids.map(id=>sql`${uuid(id)}::uuid`),sql`,`);

type Actor={id:string;role:string};
/** Admins see all; others need page scope, and editors only their own movies. */
export function movieScope(user:Actor,allowed:ReadonlySet<string>|null,alias="m"){
  if(user.role==="admin")return sql`true`;
  const column=sql.raw(`${alias}.page_id`),owner=sql.raw(`${alias}.owner_user_id`);
  const pages=[...(allowed??[])];
  const page=allowed===null?sql`true`:pages.length?sql`${column} IN (${uuidList(pages)})`:sql`false`;
  return user.role==="reviewer"?page:sql`(${page} AND ${owner}=${uuid(user.id)}::uuid)`;
}

export async function runTransaction(queries:SQL[]){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is not configured");
  const client=neon(process.env.DATABASE_URL),dialect=new PgDialect();
  return client.transaction(queries.map(query=>{const {sql:text,params}=dialect.sqlToQuery(query);return client.query(text,params);}));
}

// ---------- Upload sessions ----------
export function finalizeUploadQueries(sessionId:string,movieId:string){
  uuid(sessionId);uuid(movieId);
  return [
    sql`UPDATE movie_upload_sessions SET status='completed',updated_at=now() WHERE id=${sessionId}::uuid AND status='completing'`,
    sql`UPDATE movie_assets m SET source_storage_key=s.storage_key,status='queued',updated_at=now() FROM movie_upload_sessions s
      WHERE s.id=${sessionId}::uuid AND s.status='completed' AND m.id=s.movie_id AND m.id=${movieId}::uuid AND m.status <> 'deleting' AND m.source_storage_key IS NULL`,
    sql`INSERT INTO movie_jobs(movie_id,kind,idempotency_key) SELECT id,'process','process:'||id::text FROM movie_assets
      WHERE id=${movieId}::uuid AND status <> 'deleting' AND source_storage_key IS NOT NULL ON CONFLICT(idempotency_key) DO NOTHING`,
  ];
}

// ---------- Worker jobs ----------
export function leaseJobQuery(leaseMinutes=20){
  return sql`WITH exhausted AS (
    UPDATE movie_jobs SET status='failed',lease_token=NULL,error_message=coalesce(error_message,'MAX_ATTEMPTS'),updated_at=now()
    WHERE attempts>=${MAX_JOB_ATTEMPTS} AND (status='queued' OR (status='running' AND lease_expires_at<now())) RETURNING movie_id,kind,clip_id
  ), failed_movies AS (
    UPDATE movie_assets SET status='failed',updated_at=now() WHERE id IN (SELECT movie_id FROM exhausted WHERE kind='process') RETURNING id
  ), failed_clips AS (
    UPDATE movie_clips c SET status='render_failed',updated_at=now() FROM exhausted e WHERE e.kind='rerender' AND c.id=e.clip_id AND c.status='rendering' RETURNING c.id
  ), picked AS (
    SELECT j.id FROM movie_jobs j JOIN movie_assets m ON m.id=j.movie_id
    WHERE j.attempts<${MAX_JOB_ATTEMPTS} AND (j.status='queued' OR (j.status='running' AND j.lease_expires_at<now()))
      AND m.source_storage_key IS NOT NULL AND m.rights_status IN ('pending','verified') AND m.status <> 'deleting'
    ORDER BY j.created_at FOR UPDATE OF j,m SKIP LOCKED LIMIT 1
  )
  UPDATE movie_jobs j SET status='running',lease_token=gen_random_uuid(),lease_expires_at=now()+make_interval(mins=>${leaseMinutes}),
    attempts=j.attempts+1,error_message=NULL,updated_at=now()
  FROM picked WHERE j.id=picked.id
  RETURNING j.id,j.movie_id,j.kind,j.clip_id,j.lease_token,j.attempts,(SELECT count(*) FROM failed_movies) AS failed_count,(SELECT count(*) FROM failed_clips) AS failed_clips`;
}
const leased=(jobId:string,token:string)=>sql`j.id=${uuid(jobId)}::uuid AND j.lease_token=${uuid(token)}::uuid AND j.status='running' AND j.lease_expires_at>now()`;
export function heartbeatQuery(jobId:string,token:string,progress:number){
  const value=z.number().int().min(0).max(100).parse(progress);
  return sql`UPDATE movie_jobs j SET progress=${value},lease_expires_at=now()+interval '20 minutes',updated_at=now()
    WHERE ${leased(jobId,token)} RETURNING j.id,j.movie_id,j.kind,j.clip_id`;
}
export function processingStartedQuery(jobId:string,token:string){
  return sql`UPDATE movie_assets m SET status='processing',updated_at=now() FROM movie_jobs j WHERE ${leased(jobId,token)} AND m.id=j.movie_id AND j.kind='process' AND m.status IN ('queued','failed','processing') RETURNING m.id`;
}
export const workerCaptionSchema=z.array(z.object({start:z.number().min(0).max(30),end:z.number().min(0).max(30),text:z.string().trim().min(1).max(300)}).strict().refine(cue=>cue.end>cue.start)).max(200)
  .refine(cues=>cues.every((cue,i)=>i===0||cue.start>=cues[i-1].end),"Captions overlap");
export const reportedClipSchema=z.object({part:z.number().int().min(1).max(10000),startMs:z.number().int().min(0),captions:workerCaptionSchema}).strict();
/** Upserts rendered clips. Existing clips are never overwritten once a human may have edited them. */
export function reportClipsQuery(input:{jobId:string;token:string;movieId:string;movieTitle:string;clips:z.infer<typeof reportedClipSchema>[]}){
  const rows=input.clips.map(clip=>({part:clip.part,start_ms:clip.startMs,captions:clip.captions,base:clipOutputKey(input.movieId,clip.part,"base"),output:clipOutputKey(input.movieId,clip.part,1),title:`${input.movieTitle} - الجزء ${clip.part}`.slice(0,200)}));
  return sql`INSERT INTO movie_clips(movie_id,part_number,start_ms,duration_ms,title,captions,base_storage_key,output_storage_key,status)
    SELECT j.movie_id,v.part,v.start_ms,30000,v.title,v.captions,v.base,v.output,'pending_approval'
    FROM movie_jobs j CROSS JOIN jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS v(part int,start_ms int,captions jsonb,base text,output text,title text)
    WHERE ${leased(input.jobId,input.token)} AND j.kind='process' AND j.movie_id=${uuid(input.movieId)}::uuid
    ON CONFLICT(movie_id,part_number) DO UPDATE SET base_storage_key=EXCLUDED.base_storage_key,output_storage_key=EXCLUDED.output_storage_key,status='pending_approval',updated_at=now()
    WHERE movie_clips.status='processing' AND movie_clips.revision=1
    RETURNING id,part_number`;
}
/** Parts a process job may no longer overwrite: anything already reported past 'processing'. */
export function lockedClipPartsQuery(movieId:string,parts:number[]){
  const list=sql.join([...new Set(parts)].map(part=>sql`${z.number().int().min(1).parse(part)}::int`),sql`,`);
  return sql`SELECT part_number FROM movie_clips WHERE movie_id=${uuid(movieId)}::uuid AND status<>'processing' AND part_number IN (${list})`;
}
/** A re-render must finish against the revision it was leased for; a newer edit leaves the clip rendering for its own job. */
export function completeJobQuery(jobId:string,token:string,rerenderRevision?:number){
  const revision=rerenderRevision??0;
  return sql`WITH done AS (
    UPDATE movie_jobs j SET status='done',progress=100,lease_token=NULL,updated_at=now() WHERE ${leased(jobId,token)} RETURNING j.id,j.movie_id,j.kind,j.clip_id
  ), movie AS (
    UPDATE movie_assets m SET status='review_required',updated_at=now() FROM done WHERE done.kind='process' AND m.id=done.movie_id RETURNING m.id
  ), clip AS (
    UPDATE movie_clips c SET status='pending_approval',updated_at=now(),
      output_storage_key='movies/'||c.movie_id::text||'/clips/'||lpad(c.part_number::text,4,'0')||'/r'||c.revision::text||'.mp4'
    FROM done WHERE done.kind='rerender' AND c.id=done.clip_id AND c.status='rendering' AND c.revision=${revision} AND ${revision}>0
    RETURNING c.id
  ) SELECT done.*,(SELECT count(*) FROM clip) AS clips FROM done`;
}
export function failJobQuery(jobId:string,token:string,message:string,retryable:boolean){
  return sql`WITH failed AS (
    UPDATE movie_jobs j SET status=CASE WHEN ${retryable} AND j.attempts<${MAX_JOB_ATTEMPTS} THEN 'queued' ELSE 'failed' END,
      lease_token=NULL,lease_expires_at=NULL,error_message=${message.slice(0,500)},updated_at=now()
    WHERE ${leased(jobId,token)} RETURNING j.id,j.movie_id,j.kind,j.clip_id,j.status
  ), movie AS (
    UPDATE movie_assets m SET status='failed',updated_at=now() FROM failed WHERE failed.status='failed' AND failed.kind='process' AND m.id=failed.movie_id RETURNING m.id
  ), clip AS (
    UPDATE movie_clips c SET status='render_failed',updated_at=now() FROM failed WHERE failed.status='failed' AND failed.kind='rerender' AND c.id=failed.clip_id AND c.status='rendering' RETURNING c.id
  ) SELECT * FROM failed`;
}

// ---------- Human clip edits and review ----------
export const clipEditSchema=z.object({expectedRevision:z.number().int().min(1),title:z.string().trim().min(1).max(200).optional(),description:z.string().trim().max(2000).optional(),captions:workerCaptionSchema.optional()}).strict()
  .refine(edit=>edit.title!==undefined||edit.description!==undefined||edit.captions!==undefined,"Nothing to change");
/** Any edit bumps the revision and clears approval; caption edits also queue a burn-in re-render. */
export function editClipQuery(input:{movieId:string;clipId:string;user:Actor;allowed:ReadonlySet<string>|null;edit:unknown}){
  const edit=clipEditSchema.parse(input.edit);
  const captions=edit.captions===undefined?null:JSON.stringify(edit.captions);
  return sql`WITH changed AS (
    UPDATE movie_clips c SET revision=c.revision+1,title=coalesce(${edit.title??null},c.title),description=coalesce(${edit.description??null},c.description),
      captions=coalesce(${captions}::jsonb,c.captions),approved_by=NULL,approved_at=NULL,subtitle_reviewed=false,
      status=CASE WHEN ${captions}::jsonb IS NULL THEN 'pending_approval' ELSE 'rendering' END,updated_at=now()
    FROM movie_assets m
    WHERE c.id=${uuid(input.clipId)}::uuid AND c.movie_id=${uuid(input.movieId)}::uuid AND m.id=c.movie_id AND m.status <> 'deleting' AND c.revision=${edit.expectedRevision}
      AND c.status IN ('pending_approval','approved','rejected','render_failed') AND ${movieScope(input.user,input.allowed)}
    RETURNING c.id,c.movie_id,c.revision,c.status
  ), job AS (
    INSERT INTO movie_jobs(movie_id,clip_id,kind,idempotency_key)
    SELECT movie_id,id,'rerender','rerender:'||id::text||':'||revision::text FROM changed WHERE status='rendering'
    ON CONFLICT(idempotency_key) DO NOTHING RETURNING id
  ) SELECT changed.*,(SELECT count(*) FROM job) AS jobs FROM changed`;
}
export const clipReviewSchema=z.object({decision:z.enum(["approved","rejected","excluded"]),items:z.array(z.object({clipId:z.uuid(),revision:z.number().int().min(1)}).strict()).min(1).max(300),
  subtitlesReviewed:z.boolean(),note:z.string().trim().max(1000).optional()}).strict()
  .refine(review=>review.decision!=="approved"||review.subtitlesReviewed,"Subtitle review confirmation required");
export function reviewClipsQuery(input:{movieId:string;user:Actor;allowed:ReadonlySet<string>|null;review:unknown}){
  const review=clipReviewSchema.parse(input.review);
  const approve=review.decision==="approved";
  const values=sql.join(review.items.map(item=>sql`(${item.clipId}::uuid,${item.revision}::int)`),sql`,`);
  return sql`WITH changed AS (
    UPDATE movie_clips c SET status=${review.decision},approved_by=CASE WHEN ${approve} THEN ${uuid(input.user.id)}::uuid ELSE NULL END,
      approved_at=CASE WHEN ${approve} THEN now() ELSE NULL END,subtitle_reviewed=${approve},scheduled_at=NULL,updated_at=now()
    FROM movie_assets m,(VALUES ${values}) v(id,revision)
    WHERE c.id=v.id AND c.revision=v.revision AND c.movie_id=${uuid(input.movieId)}::uuid AND m.id=c.movie_id AND m.status <> 'deleting' AND ${movieScope(input.user,input.allowed)}
      AND EXISTS(SELECT 1 FROM users u WHERE u.id=${uuid(input.user.id)}::uuid AND u.is_active=true AND u.role IN ('admin','reviewer'))
      AND (CASE WHEN ${approve} THEN c.status IN ('pending_approval','rejected','excluded') AND c.output_storage_key IS NOT NULL AND m.rights_status IN ('pending','verified')
        ELSE c.status IN ('pending_approval','approved','scheduled','rejected','excluded') END)
    RETURNING c.id,c.revision,c.status
  ), history AS (
    INSERT INTO movie_approvals(clip_id,revision,reviewer_id,decision,note)
    SELECT id,revision,${uuid(input.user.id)}::uuid,CASE WHEN ${approve} THEN 'approved' ELSE 'rejected' END,${review.decision==="excluded"?`[excluded] ${review.note??""}`.trim():review.note??null} FROM changed RETURNING id
  ), cancelled AS (
    UPDATE movie_publications p SET status='cancelled',error_code='CLIP_REVIEW_WITHDRAWN',updated_at=now() WHERE (p.status='scheduled' OR (p.status='failed' AND ${!approve})) AND p.clip_id IN (SELECT id FROM changed) RETURNING p.id
  ) SELECT changed.*,(SELECT count(*) FROM history) AS audited,(SELECT count(*) FROM cancelled) AS cancelled FROM changed`;
}

// ---------- Scheduling ----------
export const scheduleSchema=z.object({pageId:z.uuid(),start:z.iso.datetime({offset:true}),clipIds:z.array(z.uuid()).min(1).max(300).optional()}).strict();
export const ACTIVE_PUBLICATION_STATUSES=["scheduled","publishing","processing","published","outcome_unknown"] as const;
const activeStatuses=sql.join(ACTIVE_PUBLICATION_STATUSES.map(status=>sql`${status}`),sql`,`);
export function reservationsQuery(pageId:string){
  return sql`SELECT clip_id,page_id,coalesce(published_at,scheduled_at) AS scheduled_at FROM movie_publications
    WHERE page_id=${uuid(pageId)}::uuid AND status IN (${activeStatuses}) AND coalesce(published_at,scheduled_at)>now()-interval '2 days'`;
}
/** Serialized per page by an advisory lock; the final statement aborts the whole transaction on any violation. */
export function reserveScheduleQueries(input:{movieId:string;pageId:string;slots:Array<{clipId:string;scheduledAt:Date}>}){
  uuid(input.movieId);uuid(input.pageId);
  if(!input.slots.length)throw new Error("MOVIE_SCHEDULE_EMPTY");
  const ids=uuidList(input.slots.map(slot=>slot.clipId));
  const values=sql.join(input.slots.map(slot=>sql`(${uuid(slot.clipId)}::uuid,${slot.scheduledAt.toISOString()}::timestamptz)`),sql`,`);
  return [
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${"movie-page:"+input.pageId},0))`,
    sql`DELETE FROM movie_publications WHERE status='cancelled' AND clip_id IN (${ids})`,
    sql`INSERT INTO movie_publications(clip_id,page_id,revision,scheduled_at)
      SELECT c.id,${input.pageId}::uuid,c.revision,v.at FROM (VALUES ${values}) v(id,at)
      JOIN movie_clips c ON c.id=v.id AND c.movie_id=${input.movieId}::uuid AND c.status IN ('approved','scheduled') AND c.approved_by IS NOT NULL AND c.subtitle_reviewed AND c.output_storage_key IS NOT NULL
      JOIN movie_assets m ON m.id=c.movie_id AND m.status <> 'deleting' AND m.rights_status='verified' AND m.facebook_allowed AND m.excerpts_allowed AND (m.rights_expires_at IS NULL OR m.rights_expires_at>v.at)
      JOIN facebook_pages fp ON fp.id=${input.pageId}::uuid AND fp.is_active AND fp.platform='facebook'
      WHERE v.at>now()`,
    sql`UPDATE movie_clips c SET status='scheduled',page_id=p.page_id,scheduled_at=p.scheduled_at,updated_at=now()
      FROM movie_publications p WHERE p.clip_id=c.id AND p.status='scheduled' AND c.id IN (${ids})`,
    sql`SELECT 1/(CASE WHEN (SELECT count(*) FROM movie_publications WHERE clip_id IN (${ids}) AND status='scheduled')<>${input.slots.length}
      OR EXISTS(SELECT 1 FROM movie_publications WHERE page_id=${input.pageId}::uuid AND status IN (${activeStatuses})
        GROUP BY (coalesce(published_at,scheduled_at) AT TIME ZONE ${REEL_TIME_ZONE})::date HAVING count(*)>${DAILY_REEL_LIMIT})
      THEN 0 ELSE 1 END) AS ok`,
  ];
}

// ---------- Publishing ----------
const publishable=sql`c.id=p.clip_id AND c.revision=p.revision AND c.status='scheduled' AND c.approved_by IS NOT NULL AND c.subtitle_reviewed AND c.output_storage_key IS NOT NULL
  AND (${catalogPublicationGate()})
  AND m.id=c.movie_id AND m.status <> 'deleting' AND m.rights_status='verified' AND m.facebook_allowed AND m.excerpts_allowed AND (m.rights_expires_at IS NULL OR m.rights_expires_at>now())
  AND fp.id=p.page_id AND fp.is_active AND fp.platform='facebook'`;
/** Housekeeping before a lease: invalid due reels are cancelled, abandoned sends become outcome_unknown (never resent blindly). */
export function sweepPublicationsQuery(){
  return sql`WITH invalid AS (
    UPDATE movie_publications p SET status='cancelled',error_code='RIGHTS_OR_REVIEW_INVALID',updated_at=now()
    WHERE p.status='scheduled' AND p.scheduled_at<=now() AND NOT EXISTS(SELECT 1 FROM movie_clips c,movie_assets m,facebook_pages fp WHERE ${publishable})
    RETURNING p.clip_id
  ), reset AS (
    UPDATE movie_clips c SET status='approved',scheduled_at=NULL,updated_at=now() FROM invalid WHERE c.id=invalid.clip_id AND c.status='scheduled' RETURNING c.id
  ), stale AS (
    UPDATE movie_publications SET status='outcome_unknown',error_code='PUBLISH_LEASE_EXPIRED',lease_token=NULL,updated_at=now()
    WHERE status='publishing' AND lease_expires_at<now() RETURNING id
  ) SELECT (SELECT count(*) FROM invalid) AS cancelled,(SELECT count(*) FROM stale) AS stale`;
}
const underQuota=sql`(SELECT count(*) FROM movie_publications q WHERE q.page_id=p.page_id AND q.id<>p.id AND q.status IN ('publishing','processing','published','outcome_unknown')
      AND (coalesce(q.published_at,q.scheduled_at) AT TIME ZONE ${REEL_TIME_ZONE})::date=(now() AT TIME ZONE ${REEL_TIME_ZONE})::date)<${DAILY_REEL_LIMIT}`;
/** Recheck revocations and catalogue policy after file loading, before touching Meta. */
export function checkPublicationLeaseQuery(id:string,token:string){
 return sql`SELECT p.id FROM movie_publications p,movie_clips c,movie_assets m,facebook_pages fp WHERE p.id=${uuid(id)}::uuid
  AND p.lease_token=${uuid(token)}::uuid AND p.status='publishing' AND p.lease_expires_at>now() AND ${publishable}`;
}
/** Ineligible or over-quota rows are skipped inside `due`, so one blocked page never stalls the others. */
export function leasePublicationQuery(){
  return sql`WITH due AS (
    SELECT p.id FROM movie_publications p,movie_clips c,movie_assets m,facebook_pages fp
    WHERE p.status='scheduled' AND p.scheduled_at<=now() AND ${publishable} AND ${underQuota}
      AND NOT EXISTS(SELECT 1 FROM movie_publications p2 JOIN movie_clips c2 ON c2.id=p2.clip_id
        WHERE c2.movie_id=c.movie_id AND c2.part_number<c.part_number AND p2.status IN ('scheduled','publishing','failed','outcome_unknown'))
    ORDER BY p.scheduled_at,c.part_number FOR UPDATE OF p SKIP LOCKED LIMIT 1
  )
  UPDATE movie_publications p SET status='publishing',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '10 minutes',attempts=p.attempts+1,updated_at=now()
  FROM due,movie_clips c,movie_assets m,facebook_pages fp
  WHERE p.id=due.id AND ${publishable} AND ${underQuota}
  RETURNING p.id,p.lease_token,p.attempts,c.id AS clip_id,c.part_number,c.title,c.description,c.output_storage_key,fp.facebook_page_id`;
}
/** Quota/order checks only see committed rows, so leases run serialized: the global xact lock is held until the lease commits. */
export function leasePublicationQueries(){
  return [sql`SELECT pg_advisory_xact_lock(hashtextextended('movie-publish-lease',0))`,leasePublicationQuery()];
}
/** The lease was swept to outcome_unknown while Meta accepted the reel: keep its id so nobody retries blindly. */
export function publishedAfterLeaseLostQuery(id:string,remoteId:string,permalink:string|null){
  return sql`UPDATE movie_publications SET remote_reel_id=${remoteId},remote_permalink=${permalink},error_code='PUBLISHED_AFTER_LEASE_EXPIRED',updated_at=now()
    WHERE id=${uuid(id)}::uuid AND status='outcome_unknown' RETURNING id`;
}
export function publishedQuery(id:string,token:string,remoteId:string,permalink:string|null){
  return sql`WITH pub AS (
    UPDATE movie_publications SET status='published',remote_reel_id=${remoteId},remote_permalink=${permalink},published_at=now(),lease_token=NULL,error_code=NULL,updated_at=now()
    WHERE id=${uuid(id)}::uuid AND lease_token=${uuid(token)}::uuid AND status='publishing' RETURNING clip_id
  ) UPDATE movie_clips c SET status='published',remote_reel_id=${remoteId},remote_permalink=${permalink},updated_at=now() FROM pub WHERE c.id=pub.clip_id RETURNING c.id`;
}
/** Graph rejections retry later (bounded); unknown outcomes stop for a human check. */
export function publishFailedQuery(id:string,token:string,code:string,outcome:"rejected"|"unknown"){
  return sql`UPDATE movie_publications SET status=CASE WHEN ${outcome}='unknown' THEN 'outcome_unknown' WHEN attempts<${MAX_PUBLISH_ATTEMPTS} THEN 'scheduled' ELSE 'failed' END,
    scheduled_at=CASE WHEN ${outcome}='rejected' AND attempts<${MAX_PUBLISH_ATTEMPTS} THEN now()+make_interval(mins=>15*attempts) ELSE scheduled_at END,
    error_code=${code.slice(0,300)},lease_token=NULL,updated_at=now()
    WHERE id=${uuid(id)}::uuid AND lease_token=${uuid(token)}::uuid AND status='publishing' RETURNING id,status`;
}
export const publicationActionSchema=z.object({action:z.enum(["retry","cancel","mark_published"]),checkedPage:z.literal(true),remoteReelId:z.string().trim().regex(/^\d{5,30}$/).optional()}).strict()
  .refine(input=>input.action!=="mark_published"||input.remoteReelId,"Remote reel id required");
/** Manual resolution after the operator checked the Page (prevents duplicate reels after an unknown outcome). */
export function publicationActionQuery(input:{movieId:string;publicationId:string;user:Actor;allowed:ReadonlySet<string>|null;body:unknown}){
  const body=publicationActionSchema.parse(input.body);
  const next=body.action==="retry"?"scheduled":body.action==="cancel"?"cancelled":"published";
  return sql`WITH changed AS (
    UPDATE movie_publications p SET status=${next},attempts=CASE WHEN ${next}='scheduled' THEN 0 ELSE p.attempts END,
      scheduled_at=CASE WHEN ${next}='scheduled' THEN greatest(p.scheduled_at,now()) ELSE p.scheduled_at END,
      remote_reel_id=coalesce(${body.remoteReelId??null},p.remote_reel_id),published_at=CASE WHEN ${next}='published' THEN now() ELSE p.published_at END,
      error_code=NULL,updated_at=now()
    FROM movie_clips c,movie_assets m
    WHERE p.id=${uuid(input.publicationId)}::uuid AND c.id=p.clip_id AND m.id=c.movie_id AND m.id=${uuid(input.movieId)}::uuid AND ${movieScope(input.user,input.allowed)}
      AND (p.status IN ('failed','outcome_unknown') OR (${next}='cancelled' AND p.status='scheduled'))
      AND (${next}<>'scheduled' OR (c.status='scheduled' AND c.approved_by IS NOT NULL AND p.remote_reel_id IS NULL))
    RETURNING p.id,p.clip_id,p.status
  ), clip AS (
    UPDATE movie_clips c SET status=CASE changed.status WHEN 'published' THEN 'published' WHEN 'cancelled' THEN 'approved' ELSE 'scheduled' END,
      remote_reel_id=coalesce(${body.remoteReelId??null},c.remote_reel_id),scheduled_at=CASE WHEN changed.status='cancelled' THEN NULL ELSE c.scheduled_at END,updated_at=now()
    FROM changed WHERE c.id=changed.clip_id AND (c.status='scheduled' OR changed.status='published') RETURNING c.id
  ) SELECT changed.*,(SELECT count(*) FROM clip) AS clips FROM changed`;
}
