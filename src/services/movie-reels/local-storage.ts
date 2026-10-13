import {createHash,createHmac,randomUUID,timingSafeEqual} from "node:crypto";
import {promises as fs} from "node:fs";
import path from "node:path";
import {isIsoVideoHeader,movieFileSchema,privateMovieKey,uploadPartPlan,validateClipKey,validateMovieKey} from "./upload-policy";
import type {MovieStorage} from "./private-storage";

export const LOCAL_STORAGE_ROUTE="/api/movies/local-storage/";
export type LocalOp="part"|"clip"|"read";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const methodFor=(op:LocalOp)=>op==="read"?"GET":"PUT";

function validateAnyKey(key:string){if(key.includes("/sources/"))validateMovieKey(key);else validateClipKey(key);}

export type LocalStorageConfig={root:string;secret:string;baseUrl:string};
/** Dev/test-only driver: refused outright in production. */
export function localStorageConfig(env:NodeJS.ProcessEnv=process.env):LocalStorageConfig{
  if(env.NODE_ENV==="production")throw new Error("MOVIE_LOCAL_STORAGE_FORBIDDEN_IN_PRODUCTION");
  // No guessable fallback: signed URLs grant read/write on private movies.
  const secret=env.MOVIE_LOCAL_STORAGE_SECRET?.trim()??"";
  if(secret.length<32)throw new Error("MOVIE_LOCAL_STORAGE_SECRET_REQUIRED");
  const baseUrl=(env.MOVIE_LOCAL_STORAGE_BASE_URL||env.APP_URL||"http://localhost:3000").replace(/\/+$/,"");
  return {root:path.resolve(env.MOVIE_LOCAL_STORAGE_DIR||".movie-storage"),secret,baseUrl};
}

type SignedParams={op:LocalOp;key:string;exp:number;upload?:string;part?:number;size?:number};
const payload=(p:SignedParams)=>[methodFor(p.op),p.op,p.key,p.exp,p.upload??"",p.part??"",p.size??""].join("\n");
const hmac=(secret:string,p:SignedParams)=>createHmac("sha256",secret).update(payload(p)).digest("hex");

export function signLocalUrl(cfg:LocalStorageConfig,p:Omit<SignedParams,"exp">,expiresIn:number,now=Date.now()){
  validateAnyKey(p.key);
  const full:SignedParams={...p,exp:Math.floor(now/1000)+expiresIn};
  const q=new URLSearchParams({op:full.op,exp:String(full.exp)});
  if(full.upload)q.set("upload",full.upload);
  if(full.part)q.set("part",String(full.part));
  if(full.size)q.set("size",String(full.size));
  q.set("sig",hmac(cfg.secret,full));
  return `${cfg.baseUrl}${LOCAL_STORAGE_ROUTE}${full.key}?${q}`;
}

/** Throws unless the request matches a live, untampered signature for this method. */
export function verifyLocalRequest(cfg:LocalStorageConfig,method:string,key:string,search:URLSearchParams,now=Date.now()):SignedParams{
  validateAnyKey(key);
  const op=search.get("op") as LocalOp,exp=Number(search.get("exp")),sig=search.get("sig")||"";
  if(!["part","clip","read"].includes(op)||methodFor(op)!==method.toUpperCase())throw new Error("MOVIE_LOCAL_SIGNATURE_INVALID");
  if(!Number.isInteger(exp)||exp*1000<now)throw new Error("MOVIE_LOCAL_SIGNATURE_EXPIRED");
  const p:SignedParams={op,key,exp};
  if(search.has("upload"))p.upload=search.get("upload")!;
  if(search.has("part"))p.part=Number(search.get("part"));
  if(search.has("size"))p.size=Number(search.get("size"));
  const want=Buffer.from(hmac(cfg.secret,p)),got=Buffer.from(sig);
  if(want.length!==got.length||!timingSafeEqual(want,got))throw new Error("MOVIE_LOCAL_SIGNATURE_INVALID");
  if(op==="part"&&(!p.upload||!UUID.test(p.upload)||!Number.isInteger(p.part)||!Number.isInteger(p.size)))throw new Error("MOVIE_LOCAL_SIGNATURE_INVALID");
  if(op==="clip")validateClipKey(key);
  return p;
}

const md5Tag=(b:Uint8Array)=>`"${createHash("md5").update(b).digest("hex")}"`;

export class LocalMovieStorage implements MovieStorage{
  constructor(readonly cfg:LocalStorageConfig){}
  private inside(...parts:string[]){
    const p=path.resolve(this.cfg.root,...parts);
    if(!p.startsWith(this.cfg.root+path.sep))throw new Error("MOVIE_STORAGE_KEY_INVALID");
    return p;
  }
  private objectPath(key:string){validateAnyKey(key);return this.inside("objects",...key.split("/"));}
  private uploadDir(uploadId:string){if(!UUID.test(uploadId))throw new Error("MOVIE_UPLOAD_ID_INVALID");return this.inside("uploads",uploadId);}
  private async uploadMeta(uploadId:string,key:string){
    const raw=await fs.readFile(path.join(this.uploadDir(uploadId),"meta.json"),"utf8").catch(()=>{throw new Error("MOVIE_UPLOAD_NOT_FOUND");});
    const meta=JSON.parse(raw) as {key:string;size:number;type:string};
    if(meta.key!==key)throw new Error("MOVIE_UPLOAD_NOT_FOUND");
    return meta;
  }
  private async writeObject(key:string,bytes:Uint8Array,type:string){
    const file=this.objectPath(key);
    await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(file,bytes);await fs.writeFile(file+".meta.json",JSON.stringify({type}));
  }
  async initiate(movieId:string,file:unknown){
    const metadata=movieFileSchema.parse(file);
    const key=privateMovieKey(movieId,randomUUID()),uploadId=randomUUID();
    const dir=this.uploadDir(uploadId);
    await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,"meta.json"),JSON.stringify({key,size:metadata.size,type:metadata.type}));
    return {key,uploadId,size:metadata.size,type:metadata.type,parts:uploadPartPlan(metadata.size)};
  }
  async signParts(session:{key:string;uploadId:string;size:number},numbers:number[]){
    validateMovieKey(session.key);this.uploadDir(session.uploadId);
    const plan=uploadPartPlan(session.size);
    if(!numbers.length||numbers.length>10||new Set(numbers).size!==numbers.length)throw new Error("MOVIE_UPLOAD_PARTS_INVALID");
    return numbers.map(number=>{
      const part=plan.find(p=>p.number===number);
      if(!part)throw new Error("MOVIE_UPLOAD_PARTS_INVALID");
      return {number,size:part.size,url:signLocalUrl(this.cfg,{op:"part",key:session.key,upload:session.uploadId,part:number,size:part.size},900)};
    });
  }
  /** Called by the route after signature verification; returns the part ETag. */
  async putPart(key:string,uploadId:string,number:number,size:number,body:Uint8Array){
    const meta=await this.uploadMeta(uploadId,key);
    const planned=uploadPartPlan(meta.size).find(p=>p.number===number);
    if(!planned||planned.size!==size||body.length!==size)throw new Error("MOVIE_UPLOAD_PART_SIZE_INVALID");
    const etag=md5Tag(body),file=path.join(this.uploadDir(uploadId),`part-${number}`);
    await fs.writeFile(file,body);await fs.writeFile(file+".etag",etag);
    return etag;
  }
  async putClip(key:string,body:Uint8Array){validateClipKey(key);await this.writeObject(key,body,"video/mp4");return md5Tag(body);}
  async readObject(key:string){
    const file=this.objectPath(key);
    const meta=JSON.parse(await fs.readFile(file+".meta.json","utf8")) as {type:string};
    return {bytes:await fs.readFile(file),type:meta.type};
  }
  async complete(session:{key:string;uploadId:string;size:number;type:string},parts:Array<{number:number;etag:string}>){
    validateMovieKey(session.key);
    const plan=uploadPartPlan(session.size);
    if(parts.length!==plan.length||parts.some((p,i)=>p.number!==i+1||!p.etag||p.etag.length>200))throw new Error("MOVIE_UPLOAD_PARTS_INVALID");
    const meta=await this.uploadMeta(session.uploadId,session.key);
    if(meta.size!==session.size||meta.type!==session.type)throw new Error("MOVIE_UPLOAD_INCOMPLETE");
    const dir=this.uploadDir(session.uploadId),chunks:Buffer[]=[];
    for(const [i,p] of plan.entries()){
      const file=path.join(dir,`part-${p.number}`);
      const [bytes,etag]=await Promise.all([fs.readFile(file),fs.readFile(file+".etag","utf8")]).catch(()=>{throw new Error("MOVIE_UPLOAD_INCOMPLETE");});
      if(bytes.length!==p.size||etag!==parts[i].etag)throw new Error("MOVIE_UPLOAD_INCOMPLETE");
      chunks.push(bytes);
    }
    // Mirrors S3 IfNoneMatch:"*": never overwrite an assembled source.
    if(await fs.stat(this.objectPath(session.key)).then(()=>true,()=>false))throw new Error("MOVIE_UPLOAD_ALREADY_COMPLETED");
    await this.writeObject(session.key,Buffer.concat(chunks),session.type);
    await fs.rm(dir,{recursive:true,force:true});
    return this.verify(session);
  }
  async verify(session:{key:string;size:number;type:string}){
    validateMovieKey(session.key);
    const {bytes,type}=await this.readObject(session.key).catch(()=>{throw new Error("MOVIE_UPLOADED_FILE_INVALID");});
    if(bytes.length!==session.size||type!==session.type||!isIsoVideoHeader(bytes.subarray(0,64)))throw new Error("MOVIE_UPLOADED_FILE_INVALID");
    return {key:session.key,size:bytes.length,type,versionId:null,etag:md5Tag(bytes)};
  }
  async signRead(key:string,expiresIn=3600){return signLocalUrl(this.cfg,{op:"read",key},Math.min(expiresIn,43200));}
  async signClipWrite(key:string){validateClipKey(key);return signLocalUrl(this.cfg,{op:"clip",key},3600);}
  async clipBytes(key:string,maxBytes=200*1024**2){
    validateClipKey(key);
    const {bytes}=await this.readObject(key).catch(()=>{throw new Error("MOVIE_CLIP_FILE_INVALID");});
    if(!bytes.length||bytes.length>maxBytes||!isIsoVideoHeader(bytes))throw new Error("MOVIE_CLIP_FILE_INVALID");
    return bytes;
  }
  async clipExists(key:string){
    validateClipKey(key);
    return fs.stat(this.objectPath(key)).then(s=>s.size>0,()=>false);
  }
  async abort(session:{key:string;uploadId:string}){
    validateMovieKey(session.key);
    await fs.rm(this.uploadDir(session.uploadId),{recursive:true,force:true});
  }
}

export function localMovieStorage(env:NodeJS.ProcessEnv=process.env){return new LocalMovieStorage(localStorageConfig(env));}
