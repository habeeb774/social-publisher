import {storedPageToken} from '../page-tokens';
import {request as httpsRequest} from 'node:https';

export class NewsGraphError extends Error{
 constructor(public code:string,public disposition:'blocked'|'retry'|'uncertain',public retryAfter=0){super(code);}
}
const base=()=>`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||'v23.0'}`;
// debug_token requires an input_token query parameter. Keep that server-only
// read out of Next's fetch URL instrumentation entirely; never log raw errors.
const privateGraphRead:typeof fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.protocol!=='https:'||url.hostname!=='graph.facebook.com')throw new NewsGraphError('GRAPH_HOST_REFUSED','blocked');
 return new Promise<Response>((resolve,reject)=>{
  const request=httpsRequest(url,{method:'GET',headers:Object.fromEntries(new Headers(init?.headers)),timeout:15000},res=>{
   const chunks:Buffer[]=[];let length=0;
   res.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>65536){res.destroy();reject(new Error('GRAPH_RESPONSE_TOO_LARGE'));}else chunks.push(chunk);});
   res.on('end',()=>resolve(new Response(new Uint8Array(Buffer.concat(chunks)),{status:res.statusCode??502})));
   res.on('error',reject);
  });
  request.on('timeout',()=>request.destroy(new Error('GRAPH_READ_TIMEOUT')));
  request.on('error',reject);request.end();
 });
};
type TokenInfo={is_valid?:boolean;type?:string;profile_id?:string;scopes?:string[];expires_at?:number;data_access_expires_at?:number;granular_scopes?:Array<{scope:string;target_ids?:string[]}>};
export function validPagePermission(data:TokenInfo,pageId:string,now=Date.now()/1000){
 if(!data.is_valid||data.type!=='PAGE'||String(data.profile_id)!==pageId)return false;
 if([data.expires_at,data.data_access_expires_at].some(t=>t&&t<=now))return false;
 return ['pages_manage_posts','pages_read_engagement'].every(scope=>{
  const scoped=data.granular_scopes?.find(s=>s.scope===scope);
  return Boolean(data.scopes?.includes(scope)||scoped)&&(!scoped?.target_ids?.length||scoped.target_ids.includes(pageId));
 });
}
/** All tokens stay server-side and in Authorization headers; never in logs/errors. */
export async function validateNewsPage(pageId:string,fetcher:typeof fetch=privateGraphRead,loadToken=storedPageToken){
 const token=await loadToken(pageId);
 if(!token)throw new NewsGraphError('PAGE_RECONNECT_REQUIRED','blocked');
 try{
  const debug=await fetcher(`${base()}/debug_token?input_token=${encodeURIComponent(token)}`,{
   headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});
  const data=await debug.json().catch(()=>null);
  if(!debug.ok||!validPagePermission(data?.data??{},pageId))throw new NewsGraphError('PAGE_PERMISSIONS_REQUIRED','blocked');
  const page=await fetcher(`${base()}/me?fields=id`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});
  const identity=await page.json().catch(()=>null);
  if(!page.ok||String(identity?.id)!==pageId)throw new NewsGraphError('PAGE_IDENTITY_MISMATCH','blocked');
  return {token,pageId};
 }catch(error){if(error instanceof NewsGraphError)throw error;throw new NewsGraphError('PAGE_VALIDATION_UNAVAILABLE','retry');}
}
// The write is deliberately separate from preflight so the durable 'publishing'
// marker is committed BEFORE this function can send any bytes to Meta.
export async function sendNewsPost(auth:{token:string;pageId:string},message:string,fetcher:typeof fetch=fetch){
 let response:Response;
 try{response=await fetcher(`${base()}/${encodeURIComponent(auth.pageId)}/feed`,{
  method:'POST',headers:{Authorization:`Bearer ${auth.token}`},body:new URLSearchParams({message}),
  signal:AbortSignal.timeout(20000),redirect:'error',
 });}catch{throw new NewsGraphError('META_OUTCOME_UNKNOWN','uncertain');}
 const data=await response.json().catch(()=>null);
 if(response.status>=500||!data)throw new NewsGraphError('META_OUTCOME_UNKNOWN','uncertain');
 if(data.error){
  const code=Number(data.error.code);
  const retry=[4,17,32,613,80001].includes(code)||response.status===429;
  throw new NewsGraphError(`META_REJECTED_${Number.isFinite(code)?code:'UNKNOWN'}`,retry?'retry':'blocked',Math.min(21600,Math.max(0,Number(response.headers.get('retry-after'))||0)));
 }
 if(!response.ok||typeof data.id!=='string'||!/^\d+_\d+$/.test(data.id))throw new NewsGraphError('META_OUTCOME_UNKNOWN','uncertain');
 return data.id as string;
}
export async function reconcileNewsPost(auth:{token:string;pageId:string},id:string,message:string,fetcher:typeof fetch=fetch){
 if(!id.startsWith(auth.pageId+'_')||!/^\d+_\d+$/.test(id))throw new NewsGraphError('POST_PAGE_MISMATCH','blocked');
 try{
  const response=await fetcher(`${base()}/${id}?fields=id,message`,{headers:{Authorization:`Bearer ${auth.token}`},signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.id!==id||body?.message!==message)throw new NewsGraphError('RECONCILIATION_MISMATCH','blocked');
 }catch(error){if(error instanceof NewsGraphError)throw error;throw new NewsGraphError('RECONCILIATION_UNAVAILABLE','blocked');}
}
