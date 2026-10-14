import {createHash,randomBytes} from "node:crypto";

export const YOUTUBE_SCOPES=["https://www.googleapis.com/auth/youtube.upload","https://www.googleapis.com/auth/youtube.readonly"];
export const youtubeEnabled=()=>process.env.MOVIE_YOUTUBE_ENABLED==="true";
export const youtubeConfigured=()=>Boolean(process.env.YOUTUBE_CLIENT_ID?.trim()&&process.env.YOUTUBE_CLIENT_SECRET?.trim()&&process.env.YOUTUBE_REDIRECT_URI?.trim());
export const hashState=(value:string)=>createHash("sha256").update(value).digest("hex");
export const newOAuthPair=()=>({state:randomBytes(32).toString("base64url"),verifier:randomBytes(32).toString("base64url")});
function config(){
 if(!youtubeConfigured())throw new Error("YOUTUBE_NOT_CONFIGURED");
 const redirect=new URL(process.env.YOUTUBE_REDIRECT_URI!);
 if(redirect.protocol!=="https:"&&!(process.env.NODE_ENV!=="production"&&redirect.hostname==="localhost"))throw new Error("YOUTUBE_REDIRECT_INVALID");
 return {clientId:process.env.YOUTUBE_CLIENT_ID!,clientSecret:process.env.YOUTUBE_CLIENT_SECRET!,redirect:redirect.href};
}
export function authorizationUrl(state:string,verifier:string){
 const c=config(),url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
 url.search=new URLSearchParams({client_id:c.clientId,redirect_uri:c.redirect,response_type:"code",scope:YOUTUBE_SCOPES.join(" "),
   state,access_type:"offline",prompt:"consent",code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"}).toString();
 return url.href;
}
export class YouTubeError extends Error {
 constructor(public code:string,public outcome:"rejected"|"unknown"="rejected"){super(code);}
}
type Json=Record<string,unknown>;
export async function googleJson(response:Response):Promise<Json>{
 if(!response.ok)throw new YouTubeError(`YOUTUBE_HTTP_${response.status}`,response.status>=500?"unknown":"rejected");
 try {const data:unknown=await response.json();if(!data||typeof data!=="object"||Array.isArray(data))throw new Error();return data as Json;}
 catch{throw new YouTubeError("YOUTUBE_INVALID_RESPONSE","unknown");}
}
const options={redirect:"error" as const,cache:"no-store" as const};
async function tokenRequest(values:Record<string,string>,fetcher:typeof fetch=fetch){
 const c=config();
 return googleJson(await fetcher("https://oauth2.googleapis.com/token",{...options,method:"POST",signal:AbortSignal.timeout(30000),
   headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,...values})}));
}
export async function exchangeCode(code:string,verifier:string){
 const data=await tokenRequest({grant_type:"authorization_code",code,code_verifier:verifier,redirect_uri:config().redirect});
 if(typeof data.access_token!=="string"||typeof data.refresh_token!=="string")throw new YouTubeError("YOUTUBE_REFRESH_TOKEN_REQUIRED");
 const granted=typeof data.scope==="string"?data.scope.split(" "):[];
 if(!YOUTUBE_SCOPES.every(scope=>granted.includes(scope)))throw new YouTubeError("YOUTUBE_SCOPE_MISSING");
 return {accessToken:data.access_token,refreshToken:data.refresh_token};
}
export async function refreshAccessToken(refreshToken:string){
 const data=await tokenRequest({grant_type:"refresh_token",refresh_token:refreshToken});
 if(typeof data.access_token!=="string")throw new YouTubeError("YOUTUBE_ACCESS_TOKEN_MISSING");
 return data.access_token;
}
export async function ownChannel(accessToken:string,fetcher:typeof fetch=fetch){
 const data=await googleJson(await fetcher("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",{
  ...options,signal:AbortSignal.timeout(30000),headers:{authorization:`Bearer ${accessToken}`}}));
 const channels=data.items as Array<{id?:string;snippet?:{title?:string}}>;
 if(!Array.isArray(channels)||channels.length!==1||!channels[0].id||!channels[0].snippet?.title)throw new YouTubeError("YOUTUBE_SELECT_ONE_CHANNEL");
 return {id:channels[0].id,title:channels[0].snippet.title};
}
export type VideoMetadata={title:string;description:string;privacy:"private"|"unlisted"|"public";madeForKids:boolean;syntheticMedia:boolean};
export function videoBody(meta:VideoMetadata){
 let description="";
 for(const char of meta.description.replace(/[<>]/g,"")){if(Buffer.byteLength(description+char,"utf8")>5000)break;description+=char;}
 return {snippet:{title:Array.from(meta.title.replace(/[<>]/g,"")).slice(0,100).join("")||"مقطع",description,categoryId:"24"},
  status:{privacyStatus:meta.privacy,selfDeclaredMadeForKids:meta.madeForKids,containsSyntheticMedia:meta.syntheticMedia}};
}
/** Never automatically repeats a media PUT: timeouts may have created a video. */
export async function uploadVideo(accessToken:string,video:Buffer,metadata:VideoMetadata,fetcher:typeof fetch=fetch,beforePut?:()=>Promise<boolean>){
 if(!video.length)throw new YouTubeError("YOUTUBE_EMPTY_VIDEO");
 let session:Response;
 try{session=await fetcher("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",{
  ...options,method:"POST",signal:AbortSignal.timeout(30000),headers:{authorization:`Bearer ${accessToken}`,"content-type":"application/json",
  "x-upload-content-type":"video/mp4","x-upload-content-length":String(video.length)},body:JSON.stringify(videoBody(metadata))});}
 catch{throw new YouTubeError("YOUTUBE_SESSION_FAILED");} // No media sent.
 if(!session.ok)throw new YouTubeError(`YOUTUBE_SESSION_HTTP_${session.status}`);
 const location=session.headers.get("location");
 if(!location)throw new YouTubeError("YOUTUBE_UPLOAD_URL_MISSING");
 const url=new URL(location);
 if(url.origin!=="https://www.googleapis.com"||url.username||url.password||!url.pathname.startsWith("/upload/youtube/"))throw new YouTubeError("YOUTUBE_UPLOAD_URL_INVALID");
 if(beforePut&&!await beforePut())throw new YouTubeError("YOUTUBE_APPROVAL_WITHDRAWN");
 try {
  const response=await fetcher(url,{...options,method:"PUT",signal:AbortSignal.timeout(120000),headers:{authorization:`Bearer ${accessToken}`,
    "content-type":"video/mp4","content-length":String(video.length)},body:new Uint8Array(video)});
  const data=await googleJson(response);
  if(typeof data.id!=="string"||!/^[\w-]{11}$/.test(data.id))throw new YouTubeError("YOUTUBE_VIDEO_ID_MISSING","unknown");
  return {id:data.id};
 }catch(error){if(error instanceof YouTubeError)throw error;throw new YouTubeError("YOUTUBE_UPLOAD_OUTCOME_UNKNOWN","unknown");}
}
export async function videoStatus(accessToken:string,id:string,channelId:string,fetcher:typeof fetch=fetch){
 if(!/^[\w-]{11}$/.test(id))throw new YouTubeError("YOUTUBE_VIDEO_ID_INVALID");
 const data=await googleJson(await fetcher(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${id}`,{
  ...options,signal:AbortSignal.timeout(30000),headers:{authorization:`Bearer ${accessToken}`}}));
 const item=(data.items as Array<{snippet?:{channelId?:string};status?:{uploadStatus?:string;privacyStatus?:string}}>)[0];
 if(!item||item.snippet?.channelId!==channelId)throw new YouTubeError("YOUTUBE_VIDEO_CHANNEL_MISMATCH");
 if(["failed","rejected","deleted"].includes(item.status?.uploadStatus??""))return "failed";
 if(item.status?.uploadStatus!=="processed")return "processing";
 const privacy=item.status?.privacyStatus;
 if(privacy==="public")return "published";
 if(privacy==="private"||privacy==="unlisted")return privacy;
 return "processing";
}
