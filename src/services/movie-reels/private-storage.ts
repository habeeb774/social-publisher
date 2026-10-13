import {S3Client,CreateMultipartUploadCommand,UploadPartCommand,ListPartsCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand,HeadObjectCommand,GetObjectCommand,ListObjectsV2Command,DeleteObjectsCommand} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {isIsoVideoHeader,movieFileSchema,privateMovieKey,uploadPartPlan,validateClipKey,validateMovieKey} from "./upload-policy";
import {PutObjectCommand} from "@aws-sdk/client-s3";
import {localMovieStorage} from "./local-storage";

/** Internal provider boundary: API callers must persist and authorize upload sessions.
 * Never return bucket credentials or accept a browser-supplied storage key/upload ID. */
export type MovieUploadSession={key:string;uploadId:string;size:number;type:string};
/** Provider boundary shared by the S3-compatible and local dev drivers. */
export interface MovieStorage{
  initiate(movieId:string,file:unknown):Promise<{key:string;uploadId:string;size:number;type:string;parts:Array<{number:number;offset:number;size:number}>}>;
  signParts(session:{key:string;uploadId:string;size:number},numbers:number[]):Promise<Array<{number:number;url:string;size:number}>>;
  complete(session:MovieUploadSession,parts:Array<{number:number;etag:string}>):Promise<{key:string;size:number;type:string;versionId:string|null;etag:string|null}>;
  verify(session:{key:string;size:number;type:string}):Promise<{key:string;size:number;type:string;versionId:string|null;etag:string|null}>;
  abort(session:{key:string;uploadId:string}):Promise<void>;
  signRead(key:string,expiresIn?:number):Promise<string>;
  signClipWrite(key:string):Promise<string>;
  clipBytes(key:string,maxBytes?:number):Promise<Buffer>;
  clipExists(key:string):Promise<boolean>;
}

export class PrivateMovieStorage implements MovieStorage {
  constructor(private client:S3Client,private bucket:string){}
  async initiate(movieId:string,file:unknown){
    const metadata=movieFileSchema.parse(file);
    const key=privateMovieKey(movieId,crypto.randomUUID());
    const result=await this.client.send(new CreateMultipartUploadCommand({Bucket:this.bucket,Key:key,ContentType:metadata.type,Metadata:{"movie-id":movieId,"expected-size":String(metadata.size)}}));
    if(!result.UploadId)throw new Error("MOVIE_UPLOAD_INIT_FAILED");
    return {key,uploadId:result.UploadId,size:metadata.size,type:metadata.type,parts:uploadPartPlan(metadata.size)};
  }
  async signParts(session:{key:string;uploadId:string;size:number},numbers:number[]){
    validateMovieKey(session.key);
    const plan=uploadPartPlan(session.size);
    if(!numbers.length||numbers.length>10||new Set(numbers).size!==numbers.length)throw new Error("MOVIE_UPLOAD_PARTS_INVALID");
    return Promise.all(numbers.map(async number=>{
      const part=plan.find(p=>p.number===number);
      if(!part)throw new Error("MOVIE_UPLOAD_PARTS_INVALID");
      const url=await getSignedUrl(this.client,new UploadPartCommand({Bucket:this.bucket,Key:session.key,UploadId:session.uploadId,PartNumber:number,ContentLength:part.size}),{expiresIn:900});
      return {number,url,size:part.size};
    }));
  }
  async complete(session:{key:string;uploadId:string;size:number;type:string},parts:Array<{number:number;etag:string}>){
    validateMovieKey(session.key);
    const plan=uploadPartPlan(session.size);
    if(parts.length!==plan.length||parts.some((p,i)=>p.number!==i+1||!p.etag||p.etag.length>200))throw new Error("MOVIE_UPLOAD_PARTS_INVALID");
    // Current policy caps at 800 parts, safely below one ListParts page.
    const uploaded=await this.client.send(new ListPartsCommand({Bucket:this.bucket,Key:session.key,UploadId:session.uploadId,MaxParts:1000}));
    if(uploaded.IsTruncated||uploaded.Parts?.length!==plan.length||uploaded.Parts.some((part,i)=>part.PartNumber!==plan[i].number||part.Size!==plan[i].size||part.ETag!==parts[i].etag))throw new Error("MOVIE_UPLOAD_INCOMPLETE");
    await this.client.send(new CompleteMultipartUploadCommand({Bucket:this.bucket,Key:session.key,UploadId:session.uploadId,IfNoneMatch:"*",MultipartUpload:{Parts:parts.map(p=>({PartNumber:p.number,ETag:p.etag}))}}));
    return this.verify(session);
  }
  async verify(session:{key:string;size:number;type:string}){
    validateMovieKey(session.key);
    const info=await this.client.send(new HeadObjectCommand({Bucket:this.bucket,Key:session.key}));
    if(info.ContentLength!==session.size||info.ContentType!==session.type)throw new Error("MOVIE_UPLOADED_FILE_INVALID");
    const sample=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:session.key,Range:"bytes=0-63"}));
    const bytes=await sample.Body?.transformToByteArray();
    if(!bytes||!isIsoVideoHeader(bytes))throw new Error("MOVIE_UPLOADED_FILE_INVALID");
    return {key:session.key,size:info.ContentLength,type:info.ContentType as string,versionId:info.VersionId??null,etag:info.ETag??null};
  }
  /** Short-lived read URL for the worker (source) or reviewer preview (clip). */
  async signRead(key:string,expiresIn=3600){
    if(key.includes("/sources/"))validateMovieKey(key);else validateClipKey(key);
    return getSignedUrl(this.client,new GetObjectCommand({Bucket:this.bucket,Key:key}),{expiresIn:Math.min(expiresIn,43200)});
  }
  async signClipWrite(key:string){
    validateClipKey(key);
    return getSignedUrl(this.client,new PutObjectCommand({Bucket:this.bucket,Key:key,ContentType:"video/mp4"}),{expiresIn:3600});
  }
  async clipBytes(key:string,maxBytes=200*1024**2){
    validateClipKey(key);
    const info=await this.client.send(new HeadObjectCommand({Bucket:this.bucket,Key:key}));
    if(!info.ContentLength||info.ContentLength>maxBytes)throw new Error("MOVIE_CLIP_FILE_INVALID");
    const object=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}));
    const bytes=await object.Body?.transformToByteArray();
    if(!bytes||bytes.length!==info.ContentLength||!isIsoVideoHeader(bytes))throw new Error("MOVIE_CLIP_FILE_INVALID");
    return Buffer.from(bytes);
  }
  async clipExists(key:string){
    validateClipKey(key);
    try{const info=await this.client.send(new HeadObjectCommand({Bucket:this.bucket,Key:key}));return Boolean(info.ContentLength);}catch{return false;}
  }
  async abort(session:{key:string;uploadId:string}){
    validateMovieKey(session.key);
    await this.client.send(new AbortMultipartUploadCommand({Bucket:this.bucket,Key:session.key,UploadId:session.uploadId}));
  }
  /**
   * Delete only objects under a single movie's private prefix. Repeat first-page listing
   * after each batch so deleting objects cannot skip keys during pagination.
   * This is retryable: a partial failure leaves remaining keys discoverable.
   */
  async deleteMovieFiles(movieId:string):Promise<number>{
    const prefix=movieObjectPrefix(movieId);
    let removed=0;
    for(let batch=0;batch<100;batch++){
      const listed=await this.client.send(new ListObjectsV2Command({Bucket:this.bucket,Prefix:prefix,MaxKeys:1000}));
      const keys=(listed.Contents??[]).flatMap(item=>item.Key?.startsWith(prefix)?[item.Key]:[]);
      if(!keys.length){
        if(listed.IsTruncated)throw new Error("MOVIE_STORAGE_LIST_INCOMPLETE");
        return removed;
      }
      const response=await this.client.send(new DeleteObjectsCommand({Bucket:this.bucket,Delete:{Objects:keys.map(Key=>({Key})),Quiet:true}}));
      if(response.Errors?.length)throw new Error("MOVIE_STORAGE_DELETE_FAILED");
      removed+=keys.length;
    }
    throw new Error("MOVIE_STORAGE_DELETE_LIMIT");
  }
}

export function s3MovieStorage(env:NodeJS.ProcessEnv=process.env){
  const {MOVIE_S3_ENDPOINT:endpoint,MOVIE_S3_REGION:region,MOVIE_S3_BUCKET:bucket,MOVIE_S3_ACCESS_KEY_ID:accessKeyId,MOVIE_S3_SECRET_ACCESS_KEY:secretAccessKey}=env;
  if(!endpoint||!region||!bucket||!accessKeyId||!secretAccessKey)throw new Error("MOVIE_PRIVATE_STORAGE_NOT_CONFIGURED");
  const url=new URL(endpoint);
  // http only for local MinIO outside production.
  const okProtocol=url.protocol==="https:"||(url.protocol==="http:"&&env.NODE_ENV!=="production");
  if(!okProtocol||url.username||url.password||url.search||url.hash)throw new Error("MOVIE_STORAGE_ENDPOINT_INVALID");
  const forcePathStyle=(env.MOVIE_S3_FORCE_PATH_STYLE??"true").toLowerCase()!=="false";
  return new PrivateMovieStorage(new S3Client({endpoint,region,credentials:{accessKeyId,secretAccessKey},forcePathStyle,requestChecksumCalculation:"WHEN_REQUIRED"}),bucket);
}

/** MOVIE_STORAGE_DRIVER: "s3" (default; AWS S3, R2, B2, Wasabi, MinIO) or "local" (dev/tests only). */
export function configuredMovieStorage(env:NodeJS.ProcessEnv=process.env):MovieStorage{
  const driver=(env.MOVIE_STORAGE_DRIVER||"s3").toLowerCase();
  if(driver==="s3")return s3MovieStorage(env);
  if(driver==="local")return localMovieStorage(env);
  throw new Error("MOVIE_STORAGE_DRIVER_INVALID");
}

/** Never accept a free-form storage prefix from an API client. */
export function movieObjectPrefix(movieId:string):string{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(movieId))throw new Error("MOVIE_ID_INVALID");
  return `movies/${movieId.toLowerCase()}/`;
}

/** Production deletion is limited to S3-compatible private storage (Cloudflare R2). */
export async function deleteMovieFiles(movieId:string):Promise<number>{
  const storage=configuredMovieStorage();
  if(!(storage instanceof PrivateMovieStorage))throw new Error("MOVIE_STORAGE_DELETE_UNSUPPORTED");
  return storage.deleteMovieFiles(movieId);
}
