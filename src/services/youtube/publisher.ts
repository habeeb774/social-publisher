import {sql,type SQL} from "drizzle-orm";
import {getDb} from "@/db";
import {decryptToken} from "../page-tokens";
import {configuredMovieStorage} from "../movie-reels/private-storage";
import {runTransaction} from "../movie-reels/pipeline";
import {checkYouTubeLease,finishYouTube,leaseYouTubeQueries} from "./pipeline";
import {ownChannel,refreshAccessToken,uploadVideo,videoStatus,YouTubeError,youtubeConfigured,youtubeEnabled} from "./google";

export const youtubePublishingEnabled=()=>youtubeEnabled()&&youtubeConfigured()&&process.env.MOVIE_YOUTUBE_PUBLISHING_ENABLED==="true";
type Lease={id:string;lease_token:string;title:string;description:string;output_storage_key:string;refresh_token_enc:string;google_channel_id:string;
 privacy:"private"|"unlisted"|"public";made_for_kids:boolean;synthetic_media:boolean};
type Dependencies={execute:(q:SQL)=>Promise<{rows:unknown[]}>;transaction:(q:SQL[])=>Promise<unknown[]>;bytes:(key:string)=>Promise<Buffer>;
 access:(enc:string)=>Promise<string>;channel:(access:string)=>Promise<{id:string}>;upload:typeof uploadVideo;status:typeof videoStatus};
/** One upload per cron tick. Real Google upload always requires its own explicit flag. */
export async function publishDueYouTube(deps?:Dependencies){
 if(!deps&&!youtubePublishingEnabled())return {enabled:false,uploaded:0,failed:0};
 const d=deps??{execute:(q:SQL)=>getDb().execute(q),transaction:async(q:SQL[])=>((await runTransaction(q)).at(-1) as unknown[])??[],
  bytes:(key:string)=>configuredMovieStorage().clipBytes(key),access:(enc:string)=>refreshAccessToken(decryptToken(enc)),channel:ownChannel,upload:uploadVideo,status:videoStatus};
 // A successful upload is not called "published" until Google confirms processing and privacy.
 const pending=await d.execute(sql`SELECT p.id,p.remote_video_id,ch.channel_id,ch.refresh_token_enc FROM movie_youtube_publications p
  JOIN youtube_channels ch ON ch.id=p.channel_id WHERE p.status='processing' AND ch.active ORDER BY p.updated_at LIMIT 1`);
 for(const item of pending.rows as Array<{id:string;remote_video_id:string;channel_id:string;refresh_token_enc:string}>){
  try{const access=await d.access(item.refresh_token_enc),status=await d.status(access,item.remote_video_id,item.channel_id);
   await d.execute(sql`UPDATE movie_youtube_publications SET status=${status},updated_at=now() WHERE id=${item.id}::uuid AND status='processing'`);
  }catch{ /* Keep the known video ID; never reupload on a polling failure. */ }
 }
 const [job]=await d.transaction(leaseYouTubeQueries()) as Lease[];
 if(!job)return {enabled:true,uploaded:0,failed:0};
 let mediaStarted=false;
 try{
  const video=await d.bytes(job.output_storage_key),access=await d.access(job.refresh_token_enc);
  if((await d.channel(access)).id!==job.google_channel_id)throw new YouTubeError("YOUTUBE_CHANNEL_CHANGED");
  const allowed=async()=>Boolean((await d.execute(checkYouTubeLease(job.id,job.lease_token))).rows.length);
  if(!await allowed())throw new YouTubeError("YOUTUBE_APPROVAL_WITHDRAWN");
  mediaStarted=true;
  const result=await d.upload(access,video,{title:job.title,description:job.description,privacy:job.privacy,
   madeForKids:job.made_for_kids,syntheticMedia:job.synthetic_media},fetch,allowed);
  if(!(await d.execute(finishYouTube(job.id,job.lease_token,{videoId:result.id}))).rows.length)throw new YouTubeError("YOUTUBE_LEASE_LOST_AFTER_UPLOAD","unknown");
  return {enabled:true,uploaded:1,failed:0};
 }catch(error){
  const known=error instanceof YouTubeError;
  console.error("YouTube upload failed",{publicationId:job.id,code:known?error.code:mediaStarted?"YOUTUBE_UPLOAD_OUTCOME_UNKNOWN":"YOUTUBE_PRE_UPLOAD_FAILED"});
  await d.execute(finishYouTube(job.id,job.lease_token,{error:known?error.code:mediaStarted?"YOUTUBE_UPLOAD_OUTCOME_UNKNOWN":"YOUTUBE_PRE_UPLOAD_FAILED",unknown:known?error.outcome==="unknown":mediaStarted}));
  return {enabled:true,uploaded:0,failed:1};
 }
}
