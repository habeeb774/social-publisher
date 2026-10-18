import {NextRequest,NextResponse} from "next/server";
import {timingSafeEqual,createHash} from "node:crypto";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {getDb} from "@/db";
import {configuredMovieStorage} from "@/services/movie-reels/private-storage";
import {clipOutputKey} from "@/services/movie-reels/upload-policy";
import {catalogInfo,qualitySchema,recordCatalogQuality} from "@/services/movie-reels/autopilot";
import {completeJobQuery,failJobQuery,heartbeatQuery,leaseJobQuery,lockedClipPartsQuery,processingStartedQuery,reportClipsQuery,reportedClipSchema} from "@/services/movie-reels/pipeline";

/** Machine-to-machine API for the Docker FFmpeg worker. Bearer MOVIE_WORKER_SECRET; no browser session is accepted. */
const lease={jobId:z.uuid(),leaseToken:z.uuid()};
const body=z.discriminatedUnion("action",[
  z.object({action:z.literal("lease"),workerId:z.string().trim().min(1).max(120).optional()}).strict(),
  z.object({action:z.literal("heartbeat"),...lease,workerId:z.string().trim().min(1).max(120).optional(),progress:z.number().int().min(0).max(100)}).strict(),
  z.object({action:z.literal("upload_urls"),...lease,workerId:z.string().trim().min(1).max(120).optional(),items:z.array(z.object({part:z.number().int().min(1).max(10000),variant:z.union([z.literal("base"),z.number().int().min(1)])}).strict()).min(1).max(40)}).strict(),
  z.object({action:z.literal("report_clips"),...lease,workerId:z.string().trim().min(1).max(120).optional(),clips:z.array(reportedClipSchema).min(1).max(40),quality:z.array(qualitySchema).max(5).optional(),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict(),
  z.object({action:z.literal("complete"),...lease,workerId:z.string().trim().min(1).max(120).optional(),revision:z.number().int().min(1).optional()}).strict(),
  z.object({action:z.literal("fail"),...lease,workerId:z.string().trim().min(1).max(120).optional(),error:z.string().max(500),retryable:z.boolean()}).strict(),
]);
const json=(value:unknown,status=200)=>NextResponse.json(value,{status});
const digest=(value:string)=>createHash("sha256").update(value).digest();
function authorized(request:NextRequest){
  const expected=process.env.MOVIE_WORKER_SECRET?.trim()??"";
  const provided=(request.headers.get("authorization")??"").replace(/^Bearer\s+/i,"").trim();
  return expected.length>=32&&timingSafeEqual(digest(expected),digest(provided));
}
type Leased={id:string;movie_id:string;kind:string;clip_id:string|null};

export async function POST(request:NextRequest){
  if(!authorized(request))return json({error:"Unauthorized"},401);
  if(process.env.MOVIE_REELS_ENABLED!=="true")return json({error:"MOVIE_REELS_DISABLED"},503);
  try {
    const raw=await request.text();
    if(raw.length>200000)return json({error:"TOO_LARGE"},413);
    const input=body.parse(JSON.parse(raw));
    const db=getDb(),storage=configuredMovieStorage();
    if(input.action==="lease"){
      if(input.workerId)await db.execute(sql`INSERT INTO movie_worker_heartbeats(worker_id,last_poll_at,last_success_at,current_job_id,progress,last_error,updated_at)
        VALUES(${input.workerId},now(),now(),NULL,0,NULL,now())
        ON CONFLICT(worker_id) DO UPDATE SET last_poll_at=now(),last_success_at=now(),current_job_id=NULL,progress=0,last_error=NULL,updated_at=now()`);
      const [job]=(await db.execute(leaseJobQuery())).rows as Array<Leased&{lease_token:string;attempts:number}>;
      if(!job)return json({job:null});
      const [movie]=(await db.execute(sql`SELECT id,title,source_storage_key FROM movie_assets WHERE id=${job.movie_id}::uuid`)).rows as Array<{id:string;title:string;source_storage_key:string}>;
      const base={id:job.id,leaseToken:job.lease_token,kind:job.kind,attempts:job.attempts,movieId:movie.id,movieTitle:movie.title,autopilot:await catalogInfo(movie.id)};
      if(job.kind==="rerender"){
        const [clip]=(await db.execute(sql`SELECT id,part_number,revision,captions,base_storage_key FROM movie_clips WHERE id=${job.clip_id}::uuid AND status='rendering'`)).rows as Array<{id:string;part_number:number;revision:number;captions:unknown;base_storage_key:string|null}>;
        if(!clip?.base_storage_key){
          await db.execute(failJobQuery(job.id,job.lease_token,"CLIP_NOT_RENDERING",false));
          return json({job:null});
        }
        return json({job:{...base,clip:{id:clip.id,part:clip.part_number,revision:clip.revision,captions:clip.captions,baseUrl:await storage.signRead(clip.base_storage_key,7200)}}});
      }
      await db.execute(processingStartedQuery(job.id,job.lease_token));
      if(input.workerId)await db.execute(sql`UPDATE movie_worker_heartbeats SET current_job_id=${job.id}::uuid,progress=1,last_success_at=now(),updated_at=now() WHERE worker_id=${input.workerId}`);
      const existing=(await db.execute(sql`SELECT part_number FROM movie_clips WHERE movie_id=${movie.id}::uuid`)).rows as Array<{part_number:number}>;
      // Name/size let a worker on the uploader's own PC reuse the local original after byte-sampling it against storage.
      const [source]=(await db.execute(sql`SELECT file_name,size_bytes FROM movie_upload_sessions WHERE movie_id=${movie.id}::uuid AND storage_key=${movie.source_storage_key} AND status='completed' LIMIT 1`)).rows as Array<{file_name:string;size_bytes:string|number}>;
      return json({job:{...base,sourceUrl:await storage.signRead(movie.source_storage_key,43200),sourceName:source?.file_name??null,sourceSize:source?Number(source.size_bytes):null,existingParts:existing.map(row=>row.part_number)}});
    }
    if(input.action==="fail"){
      const result=await db.execute(failJobQuery(input.jobId,input.leaseToken,input.error,input.retryable));
      return result.rows.length?json({ok:true,status:(result.rows[0] as {status:string}).status}):json({error:"LEASE_LOST"},409);
    }
    // Every remaining action renews and proves the lease first.
    const progress=input.action==="heartbeat"?input.progress:input.action==="complete"?99:50;
    const [job]=(await db.execute(heartbeatQuery(input.jobId,input.leaseToken,progress))).rows as Leased[];
    if(!job)return json({error:"LEASE_LOST"},409);
    if(input.workerId)await db.execute(sql`UPDATE movie_worker_heartbeats SET last_poll_at=now(),last_success_at=now(),current_job_id=${input.jobId}::uuid,progress=${progress},last_error=NULL,updated_at=now() WHERE worker_id=${input.workerId}`);
    if(input.action==="heartbeat")return json({ok:true});
    if(input.action==="upload_urls"){
      let allowed=(part:number,variant:"base"|number)=>job.kind==="process"&&(variant==="base"||variant===1)&&part>0;
      if(job.kind==="rerender"){
        const [clip]=(await db.execute(sql`SELECT part_number,revision FROM movie_clips WHERE id=${job.clip_id}::uuid AND status='rendering'`)).rows as Array<{part_number:number;revision:number}>;
        allowed=(part,variant)=>Boolean(clip)&&part===clip.part_number&&variant===clip.revision;
      } else {
        // A resumed process job may only write parts not yet reported (or still processing): reviewed clips are immutable.
        const locked=(await db.execute(lockedClipPartsQuery(job.movie_id,input.items.map(item=>item.part)))).rows as Array<{part_number:number}>;
        if(locked.length)return json({error:"UPLOAD_TARGET_NOT_ALLOWED",parts:locked.map(row=>row.part_number)},403);
      }
      if(input.items.some(item=>!allowed(item.part,item.variant)))return json({error:"UPLOAD_TARGET_NOT_ALLOWED"},403);
      return json({urls:await Promise.all(input.items.map(async item=>({...item,url:await storage.signClipWrite(clipOutputKey(job.movie_id,item.part,item.variant))})))});
    }
    if(input.action==="report_clips"){
      if(job.kind!=="process")return json({error:"WRONG_JOB_KIND"},409);
      for(const clip of input.clips)for(const variant of ["base",1] as const)if(!(await storage.clipExists(clipOutputKey(job.movie_id,clip.part,variant))))return json({error:"CLIP_OUTPUT_MISSING",part:clip.part},409);
      const [movie]=(await db.execute(sql`SELECT title FROM movie_assets WHERE id=${job.movie_id}::uuid`)).rows as Array<{title:string}>;
      const result=await db.execute(reportClipsQuery({jobId:input.jobId,token:input.leaseToken,movieId:job.movie_id,movieTitle:movie.title,clips:input.clips}));
      if(input.quality&&input.sourceSha256)await recordCatalogQuality(job.movie_id,input.sourceSha256,input.quality);
      return json({ok:true,saved:result.rows.length});
    }
    if(job.kind==="rerender"){
      const [clip]=(await db.execute(sql`SELECT part_number,revision FROM movie_clips WHERE id=${job.clip_id}::uuid`)).rows as Array<{part_number:number;revision:number}>;
      if(!clip||clip.revision!==input.revision||!(await storage.clipExists(clipOutputKey(job.movie_id,clip.part_number,clip.revision))))return json({error:"RERENDER_OUTPUT_MISSING_OR_STALE"},409);
    }
    const result=await db.execute(completeJobQuery(input.jobId,input.leaseToken,input.revision));
    return result.rows.length?json({ok:true}):json({error:"LEASE_LOST"},409);
  } catch(error){
    if(error instanceof SyntaxError||error instanceof z.ZodError)return json({error:"INVALID_REQUEST"},400);
    console.error("Movie worker API failed",{code:"MOVIE_WORKER_API_FAILED",detail:error instanceof Error?error.message.slice(0,200):undefined});
    return json({error:"UNAVAILABLE"},503);
  }
}
