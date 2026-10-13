import {strict as assert} from "node:assert";
import {test} from "node:test";
import {S3Client,ListPartsCommand,CompleteMultipartUploadCommand,HeadObjectCommand,GetObjectCommand} from "@aws-sdk/client-s3";
import {PrivateMovieStorage} from "../src/services/movie-reels/private-storage";
const key="movies/12345678-1234-4123-8123-123456789012/sources/12345678-1234-4123-8123-123456789013";
const session={key,uploadId:"opaque",size:12,type:"video/mp4"};
test("completion verifies stored sizes/ETags before assembly and checks video bytes",async()=>{
  const calls:unknown[]=[];
  const client={send:async(command:unknown)=>{
    calls.push(command);
    if(command instanceof ListPartsCommand)return {Parts:[{PartNumber:1,Size:12,ETag:'"tag"'}]};
    if(command instanceof CompleteMultipartUploadCommand){assert.equal(command.input.IfNoneMatch,"*");return {};}
    if(command instanceof HeadObjectCommand)return {ContentLength:12,ContentType:"video/mp4",ETag:'"object"'};
    if(command instanceof GetObjectCommand){assert.equal(command.input.Range,"bytes=0-63");return {Body:{transformToByteArray:async()=>Buffer.from("0000ftypisom")}};}
    throw new Error("unexpected command");
  }} as unknown as S3Client;
  const result=await new PrivateMovieStorage(client,"private").complete(session,[{number:1,etag:'"tag"'}]);
  assert.equal(result.key,key);assert.equal(calls.length,4);
});
test("bad stored part cannot complete or become accepted source",async()=>{
  let completed=false;
  const client={send:async(command:unknown)=>{
    if(command instanceof ListPartsCommand)return {Parts:[{PartNumber:1,Size:99,ETag:'"tag"'}]};
    completed=true;return {};
  }} as unknown as S3Client;
  await assert.rejects(()=>new PrivateMovieStorage(client,"private").complete(session,[{number:1,etag:'"tag"'}]),/MOVIE_UPLOAD_INCOMPLETE/);
  assert.equal(completed,false);
});
