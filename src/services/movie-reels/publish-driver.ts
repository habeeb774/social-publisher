import {randomInt} from "node:crypto";
import {graphVideoPermalink,publishGraphReel} from "../facebook-graph";

export type MovieReelTarget={
  publish:(pageId:string,video:Buffer,description:string)=>Promise<{id:string}>;
  permalink:(pageId:string,videoId:string)=>Promise<string|null>;
};
export type MoviePublishDriver="meta"|"mock";
type Env=Record<string,string|undefined>;

/** MOVIE_PUBLISH_DRIVER: meta (default) or mock. Mock is refused in production. */
export function moviePublishDriver(env:Env=process.env):MoviePublishDriver{
  const value=(env.MOVIE_PUBLISH_DRIVER??"meta").trim().toLowerCase()||"meta";
  if(value==="meta")return "meta";
  if(value==="mock"){
    if(env.NODE_ENV==="production")throw new Error("MOVIE_PUBLISH_DRIVER_MOCK_IN_PRODUCTION");
    return "mock";
  }
  throw new Error(`MOVIE_PUBLISH_DRIVER_INVALID: ${value}`);
}

// 30s 9:16 reels are ~10-40MB; the default 30s upload timeout is too tight for them.
const REEL_UPLOAD_TIMEOUT_MS=120_000;
export const metaReelTarget:MovieReelTarget={publish:(page,video,caption)=>publishGraphReel(page,video,caption,REEL_UPLOAD_TIMEOUT_MS),permalink:graphVideoPermalink};

export type MockReel={pageId:string;id:string;bytes:number;description:string;at:string};
/** Records sends in memory; never touches the network. */
export function mockReelTarget(log:MockReel[]=[]):MovieReelTarget&{log:MockReel[]}{
  return {log,
    publish:async(pageId,video,description)=>{
      if(!video.length)throw new Error("FACEBOOK_GRAPH_ERROR: mock rejected empty video");
      const id=String(randomInt(10**9,2**47));log.push({pageId,id,bytes:video.length,description,at:new Date().toISOString()});return {id};
    },
    permalink:async(_page,videoId)=>`https://example.invalid/reel/${encodeURIComponent(videoId)}`};
}

export const movieReelTarget=(env:Env=process.env):MovieReelTarget=>moviePublishDriver(env)==="mock"?mockReelTarget():metaReelTarget;
