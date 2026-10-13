import type {SQL} from "drizzle-orm";
import {getDb} from "@/db";
import {graphVideoPermalink,publishGraphReel} from "../facebook-graph";
import {configuredMovieStorage} from "./private-storage";
import {leasePublicationQuery,publishedQuery,publishFailedQuery,sweepPublicationsQuery} from "./pipeline";

type Leased={id:string;lease_token:string;clip_id:string;part_number:number;title:string;description:string;output_storage_key:string;facebook_page_id:string};
export type MoviePublishDeps={
  execute:(query:SQL)=>Promise<{rows:unknown[]}>;
  clipBytes:(key:string)=>Promise<Buffer>;
  publish:(pageId:string,video:Buffer,description:string)=>Promise<{id:string}>;
  permalink:(pageId:string,videoId:string)=>Promise<string|null>;
};
export const reelCaption=(clip:{title:string;description:string;part_number:number})=>{
  const heading=clip.title.includes(`الجزء ${clip.part_number}`)?clip.title:`${clip.title} - الجزء ${clip.part_number}`;
  return [heading,clip.description].filter(Boolean).join("\n\n").slice(0,2200);
};

/** Separate explicit gate: section enabled is NOT publishing authorization. */
export const moviePublishingEnabled=()=>process.env.MOVIE_REELS_ENABLED==="true"&&process.env.MOVIE_REELS_PUBLISHING_ENABLED==="true";

/** Sends at most `limit` due reels. Each send is leased; rights/review/order/quota were rechecked in the lease statement. */
export async function publishDueMovieReels(limit=1,deps?:MoviePublishDeps){
  if(!deps&&!moviePublishingEnabled())return {enabled:false,published:0,failed:0};
  const d=deps??defaultDeps();
  await d.execute(sweepPublicationsQuery());
  let published=0,failed=0;
  for(let i=0;i<limit;i++){
    const [job]=(await d.execute(leasePublicationQuery())).rows as Leased[];
    if(!job)break;
    let video:Buffer;
    try {video=await d.clipBytes(job.output_storage_key);}
    catch(error){
      // Nothing was sent to Meta: safe to retry later.
      await d.execute(publishFailedQuery(job.id,job.lease_token,`STORAGE:${error instanceof Error?error.message:"read failed"}`,"rejected"));failed++;continue;
    }
    try {
      const result=await d.publish(job.facebook_page_id,video,reelCaption(job));
      const permalink=await d.permalink(job.facebook_page_id,result.id).catch(()=>null);
      await d.execute(publishedQuery(job.id,job.lease_token,result.id,permalink));published++;
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
  return {execute:query=>getDb().execute(query),clipBytes:key=>storage.clipBytes(key),publish:publishGraphReel,permalink:graphVideoPermalink};
}
