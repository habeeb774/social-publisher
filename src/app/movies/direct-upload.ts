import {movieFileSchema,uploadPartPlan} from "@/services/movie-reels/upload-policy";
export type UploadReceipt={number:number;etag:string};
export type UploadProgress={phase:"uploading"|"verifying"|"done";loaded:number;total:number};
export type UploadPorts={
  initiate:(metadata:{name:string;size:number;type:string})=>Promise<{id:string}>;
  sign:(id:string,number:number)=>Promise<{url:string;size:number}>;
  complete:(id:string,parts:UploadReceipt[])=>Promise<void>;
  abort:(id:string)=>Promise<void>;
  put:(url:string,body:Blob,signal:AbortSignal,onProgress:(bytes:number)=>void)=>Promise<string>;
};
export class UploadCompletionUnknown extends Error {
  constructor(public readonly sessionId:string){super("MOVIE_UPLOAD_COMPLETION_UNKNOWN");}
}
/** Movie bytes go ONLY to signed storage URLs through put, never to API metadata calls. */
export async function directMovieUpload(file:Pick<File,"name"|"size"|"type"|"slice">,ports:UploadPorts,signal:AbortSignal,onProgress:(progress:UploadProgress)=>void){
  const metadata=movieFileSchema.parse({name:file.name,size:file.size,type:file.type});
  signal.throwIfAborted();
  const session=await ports.initiate(metadata);
  const receipts:UploadReceipt[]=[];
  let finishedBytes=0;
  let completionStarted=false;
  try {
    for(const part of uploadPartPlan(file.size)){
      signal.throwIfAborted();
      const body=file.slice(part.offset,part.offset+part.size);
      if(body.size!==part.size)throw new Error("MOVIE_UPLOAD_FILE_CHANGED");
      let etag:string|undefined;
      for(let attempt=0;attempt<3&&!etag;attempt++){
        signal.throwIfAborted();
        const signed=await ports.sign(session.id,part.number);
        if(signed.size!==part.size)throw new Error("MOVIE_UPLOAD_PART_SIZE_MISMATCH");
        try {
          const candidate=await ports.put(signed.url,body,signal,bytes=>onProgress({phase:"uploading",loaded:finishedBytes+Math.max(0,Math.min(part.size,bytes)),total:file.size}));
          if(!candidate||candidate.length>200)throw new Error("MOVIE_UPLOAD_ETAG_MISSING");
          etag=candidate;
        } catch(error){signal.throwIfAborted();if(attempt===2)throw error;}
      }
      if(!etag)throw new Error("MOVIE_UPLOAD_PART_FAILED");
      receipts.push({number:part.number,etag});finishedBytes+=part.size;
      onProgress({phase:"uploading",loaded:finishedBytes,total:file.size});
    }
    signal.throwIfAborted();
    completionStarted=true;
    onProgress({phase:"verifying",loaded:file.size,total:file.size});
    try {await ports.complete(session.id,receipts);}
    catch {throw new UploadCompletionUnknown(session.id);}
    onProgress({phase:"done",loaded:file.size,total:file.size});
    return {sessionId:session.id,parts:receipts};
  } catch(error){
    // Completion might have committed: never abort/re-initiate automatically.
    if(!completionStarted)await ports.abort(session.id).catch(()=>undefined);
    throw error;
  }
}

/** Browser transport uses no cookies and reveals no signed URL in error messages. */
export function putMoviePart(url:string,body:Blob,signal:AbortSignal,onProgress:(bytes:number)=>void):Promise<string>{
  return new Promise((resolve,reject)=>{
    const parsed=new URL(url);
    if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.origin===window.location.origin){reject(new Error("MOVIE_UPLOAD_DESTINATION_INVALID"));return;}
    const xhr=new XMLHttpRequest();
    const cleanup=()=>signal.removeEventListener("abort",cancel);
    const fail=(code:string)=>{cleanup();reject(new Error(code));};
    const cancel=()=>xhr.abort();
    xhr.open("PUT",url);xhr.withCredentials=false;xhr.timeout=300000;
    xhr.upload.onprogress=event=>onProgress(event.loaded);
    xhr.onload=()=>{cleanup();if(xhr.status<200||xhr.status>=300){reject(new Error("MOVIE_UPLOAD_PART_FAILED"));return;}const etag=xhr.getResponseHeader("ETag");if(!etag){reject(new Error("MOVIE_UPLOAD_ETAG_MISSING"));return;}resolve(etag);};
    xhr.onerror=()=>fail("MOVIE_UPLOAD_CONNECTION_FAILED");xhr.ontimeout=()=>fail("MOVIE_UPLOAD_TIMEOUT");xhr.onabort=()=>fail("MOVIE_UPLOAD_CANCELLED");
    signal.addEventListener("abort",cancel,{once:true});
    if(signal.aborted){cleanup();reject(new Error("MOVIE_UPLOAD_CANCELLED"));return;}
    xhr.send(body);
  });
}
