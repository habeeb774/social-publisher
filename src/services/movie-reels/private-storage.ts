import {S3Client,CreateMultipartUploadCommand,UploadPartCommand,ListPartsCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand,HeadObjectCommand,GetObjectCommand} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {isIsoVideoHeader,movieFileSchema,privateMovieKey,uploadPartPlan,validateClipKey,validateMovieKey} from "./upload-policy";
import {PutObjectCommand} from "@aws-sdk/client-s3";

/** Internal provider boundary: API callers must persist and authorize upload sessions.
 * Never return bucket credentials or accept a browser-supplied storage key/upload ID. */
export class PrivateMovieStorage {
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
    return {key:session.key,size:info.ContentLength,type:info.ContentType,versionId:info.VersionId??null,etag:info.ETag??null};
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
}

export function configuredMovieStorage(){
  const {MOVIE_S3_ENDPOINT:endpoint,MOVIE_S3_REGION:region,MOVIE_S3_BUCKET:bucket,MOVIE_S3_ACCESS_KEY_ID:accessKeyId,MOVIE_S3_SECRET_ACCESS_KEY:secretAccessKey}=process.env;
  if(!endpoint||!region||!bucket||!accessKeyId||!secretAccessKey)throw new Error("MOVIE_PRIVATE_STORAGE_NOT_CONFIGURED");
  const url=new URL(endpoint);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)throw new Error("MOVIE_STORAGE_ENDPOINT_INVALID");
  return new PrivateMovieStorage(new S3Client({endpoint,region,credentials:{accessKeyId,secretAccessKey},forcePathStyle:true,requestChecksumCalculation:"WHEN_REQUIRED"}),bucket);
}
