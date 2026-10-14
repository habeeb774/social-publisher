import {z} from "zod";
import {getSetting,setSetting} from "../settings-store";
import {youtubeConfigured,youtubeEnabled} from "../youtube/google";

export const publishingControlSchema=z.object({platform:z.enum(["facebook","youtube"]),enabled:z.boolean(),confirmed:z.literal(true)}).strict();
export type MoviePlatform="facebook"|"youtube";
export const publishingKey=(platform:MoviePlatform)=>`movie_${platform}_publishing_enabled`;
export function publishingAvailable(platform:MoviePlatform){
 return platform==="facebook"?process.env.MOVIE_REELS_ENABLED==="true":youtubeEnabled()&&youtubeConfigured();
}
export function publishingDefault(platform:MoviePlatform){
 return process.env[platform==="facebook"?"MOVIE_REELS_PUBLISHING_ENABLED":"MOVIE_YOUTUBE_PUBLISHING_ENABLED"]==="true";
}
// Uncached: the worker sees the current switch, including before sending bytes.
// Missing settings preserve deployment defaults; malformed/unavailable settings fail closed.
export async function platformPublishingEnabled(platform:MoviePlatform,read=getSetting):Promise<boolean>{
 if(!publishingAvailable(platform))return false;
 try{return await read<unknown>(publishingKey(platform),publishingDefault(platform),{strict:true})===true;}
 catch{return false;}
}
export async function setPlatformPublishing(platform:MoviePlatform,enabled:boolean){
 if(enabled&&!publishingAvailable(platform))throw new Error("MOVIE_PUBLISHING_NOT_CONFIGURED");
 await setSetting(publishingKey(platform),enabled);
}
