import {sql,type SQL} from "drizzle-orm";
import {getDb} from "@/db";
import {movieReelTarget} from "./publish-driver";
import {configuredMovieStorage} from "./private-storage";
import {platformPublishingEnabled} from "./publishing-control";
import {leasePublicationQueries,publishedAfterLeaseLostQuery,publishedQuery,publishFailedQuery,runTransaction,sweepPublicationsQuery} from "./pipeline";

type Leased={id:string;lease_token:string;clip_id:string;part_number:number;title:string;description:string;output_storage_key:string;facebook_page_id:string};
export type MoviePublishDeps={
  enabled?:()=>Promise<boolean>;
  execute:(query:SQL)=>Promise<{rows:unknown[]}>;
  /** Runs the statements in one transaction and returns the last statement's rows (serializes leases). */
  transaction:(queries:SQL[])=>Promise<unknown[]>;
  clipBytes:(key:string)=>Promise<Buffer>;
  publish:(pageId:string,video:Buffer,description:string)=>Promise<{id:string}>;
  permalink:(pageId:string,videoId:string)=>Promise<string|null>;
};
export const reelCaption=(clip:{title:string;description:string;part_number:number})=>{
  const heading=clip.title.includes(`الجزء ${clip.part_number}`)?clip.title:`${clip.title} - الجزء ${clip.part_number}`;
  return [heading,clip.description].filter(Boolean).join("\n\n").slice(0,2200);
};

/** Separate explicit gate: section enabled is NOT publishing authorization. */
export const moviePublishingEnabled=()=>platformPublishingEnabled("facebook");

/** Sends at most `limit` due reels. Each send is leased; rights/review/order/quota were rechecked in the lease statement. */
export async function publishDueMovieReels(limit=1,deps?:MoviePublishDeps){
  const enabled=deps?(deps.enabled??(async()=>true)):moviePublishingEnabled;
  if(!await enabled())return {enabled:false,published:0,failed:0};
  const d=deps??defaultDeps();
  await d.execute(sweepPublicationsQuery());
  let published=0,failed=0;
  for(let i=0;i<limit;i++){
    if(!await enabled())break;
    const [job]=await d.transaction(leasePublicationQueries()) as Leased[];
    if(!job)break;
    let video:Buffer;
    try {video=await d.clipBytes(job.output_storage_key);}
    catch(error){
      // Nothing was sent to Meta: safe to retry later.
      await d.execute(publishFailedQuery(job.id,job.lease_token,`STORAGE:${error instanceof Error?error.message:"read failed"}`,"rejected"));failed++;continue;
    }
    try {
      if(!await enabled()){
        await d.execute(sql`UPDATE movie_publications SET status='scheduled',attempts=greatest(0,attempts-1),lease_token=NULL,
          lease_expires_at=NULL,updated_at=now() WHERE id=${job.id}::uuid AND lease_token=${job.lease_token}::uuid AND status='publishing'`);break;
      }
      const result=await d.publish(job.facebook_page_id,video,reelCaption(job));
      const permalink=await d.permalink(job.facebook_page_id,result.id).catch(()=>null);
      if((await d.execute(publishedQuery(job.id,job.lease_token,result.id,permalink))).rows.length){published++;continue;}
      // Lease expired mid-send and was swept to outcome_unknown: record the reel id for the human check, never count it as clean.
      await d.execute(publishedAfterLeaseLostQuery(job.id,result.id,permalink));failed++;
      console.error("Movie reel published after lease expired",{code:"MOVIE_PUBLISH_LEASE_LOST",publicationId:job.id,remoteId:result.id});
    } catch(error){
      const message=error instanceof Error?error.message:String(error);
      // Only an explicit Graph error body proves nothing was published; anything else may have posted.
      const outcome=message.startsWith("FACEBOOK_GRAPH_ERROR")?"rejected":"unknown";
      await d.execute(publishFailedQuery(job.id,job.lease_token,message,outcome));failed++;
    }
  }
  return {enabled:true,published,failed};
}

function defaultDeps():MoviePublishDeps{
  const storage=configuredMovieStorage();
  const target=movieReelTarget();
  return {execute:query=>getDb().execute(query),transaction:async queries=>((await runTransaction(queries)).at(-1) as unknown[])??[],clipBytes:key=>storage.clipBytes(key),publish:target.publish,permalink:target.permalink};
}
