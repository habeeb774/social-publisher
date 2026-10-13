import { z } from "zod";
export const MOVIE_MAX_BYTES=50*1024**3;
export const MOVIE_PART_BYTES=64*1024**2;
export const movieFileSchema=z.object({name:z.string().trim().min(1).max(180),size:z.number().int().min(1).max(MOVIE_MAX_BYTES),type:z.enum(["video/mp4","video/quicktime"])}).strict().refine(file=>file.type==="video/mp4"?/\.mp4$/i.test(file.name):/\.mov$/i.test(file.name),"File extension does not match MIME type");
export function uploadPartPlan(size:number){
  if(!Number.isSafeInteger(size)||size<1||size>MOVIE_MAX_BYTES)throw new Error("MOVIE_FILE_SIZE_INVALID");
  return Array.from({length:Math.ceil(size/MOVIE_PART_BYTES)},(_,i)=>({number:i+1,offset:i*MOVIE_PART_BYTES,size:Math.min(MOVIE_PART_BYTES,size-i*MOVIE_PART_BYTES)}));
}
export function privateMovieKey(movieId:string,uploadId:string){
  if(!z.uuid().safeParse(movieId).success||!z.uuid().safeParse(uploadId).success)throw new Error("MOVIE_UPLOAD_ID_INVALID");
  return `movies/${movieId}/sources/${uploadId}`;
}
export function validateMovieKey(key:string){
  if(!/^movies\/[0-9a-f-]{36}\/sources\/[0-9a-f-]{36}$/.test(key))throw new Error("MOVIE_STORAGE_KEY_INVALID");
}
export function isIsoVideoHeader(bytes:Uint8Array){
  return bytes.length>=12&&String.fromCharCode(...bytes.slice(4,8))==="ftyp";
}
/** Worker outputs live under the movie prefix; the server derives every key, never the worker. */
export function clipOutputKey(movieId:string,part:number,variant:"base"|number){
  if(!z.uuid().safeParse(movieId).success||!Number.isInteger(part)||part<1||part>10000)throw new Error("MOVIE_CLIP_KEY_INVALID");
  if(variant!=="base"&&(!Number.isInteger(variant)||variant<1))throw new Error("MOVIE_CLIP_KEY_INVALID");
  return `movies/${movieId}/clips/${String(part).padStart(4,"0")}/${variant==="base"?"base":`r${variant}`}.mp4`;
}
export function validateClipKey(key:string,movieId?:string){
  const match=/^movies\/([0-9a-f-]{36})\/clips\/\d{4}\/(base|r\d+)\.mp4$/.exec(key);
  if(!match||(movieId&&match[1]!==movieId))throw new Error("MOVIE_STORAGE_KEY_INVALID");
}
