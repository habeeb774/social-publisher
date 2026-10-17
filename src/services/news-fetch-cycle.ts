/** Public news only. A request-scoped single-flight cache: not global state,
 * not a credential cache, and never shared between scheduler cycles. */
export function createNewsFetchCycle(fetcher:typeof fetch=fetch){
 type Snapshot={bytes:ArrayBuffer;status:number;contentType:string};
 const pending=new Map<string,Promise<Snapshot>>();
 let requests=0,hits=0;
 const sharedFetch:typeof fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const headers=new Headers(init?.headers);
  if(url.protocol!=='https:'||url.username||url.password||headers.has('authorization')||headers.has('cookie')||(init?.method&&init.method!=='GET'))throw new Error('PUBLIC_NEWS_GET_ONLY');
  url.hash='';const key=url.href;
  let task=pending.get(key);
  if(task)hits++;
  else{
   if(pending.size>=64)throw new Error('NEWS_CYCLE_SOURCE_LIMIT');
   requests++;
   task=(async()=>{
    const response=await fetcher(key,{method:'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html'}});
    const reader=response.body?.getReader(),parts:Uint8Array[]=[];let size=0;
    if(reader){try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024*1024)throw new Error('NEWS_SOURCE_TOO_LARGE');parts.push(part.value);}}finally{await reader.cancel();reader.releaseLock();}}
    return {bytes:new Uint8Array(Buffer.concat(parts)).buffer,status:response.status,contentType:response.headers.get('content-type')??'application/octet-stream'};
   })();
   pending.set(key,task);
  }
  // Each consumer gets its own readable body, including shared HTTP failures.
  const result=await task;
  return new Response([204,205,304].includes(result.status)?null:result.bytes,{status:result.status,headers:{'content-type':result.contentType}});
 };
 return {fetcher:sharedFetch,stats:()=>({requests,hits,sources:pending.size})};
}
