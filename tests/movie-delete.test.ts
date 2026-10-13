import {strict as assert} from "node:assert";
import {test} from "node:test";
import {S3Client,ListObjectsV2Command,DeleteObjectsCommand} from "@aws-sdk/client-s3";
import {PrivateMovieStorage,movieObjectPrefix} from "../src/services/movie-reels/private-storage";

const id="12345678-1234-4123-8123-123456789012";
test("movie deletion can only use a validated single-movie prefix",()=>{
  assert.equal(movieObjectPrefix(id),`movies/${id}/`);
  for(const unsafe of ["../movie","movies/../../","bad","12345678-1234-4123-8123-123456789012/other"])
    assert.throws(()=>movieObjectPrefix(unsafe),/MOVIE_ID_INVALID/);
});

test("movie deletion removes only that movie, verifies prefix emptiness and can be retried",async()=>{
  const target=movieObjectPrefix(id),other=movieObjectPrefix("12345678-1234-4123-8123-123456789013");
  const objects=new Set([target+"sources/file",target+"clips/0001/base.mp4",other+"sources/file"]);
  let reads=0;
  const client={send:async(command:unknown)=>{
    if(command instanceof ListObjectsV2Command){
      assert.equal(command.input.Prefix,target);
      reads++;
      return {Contents:[...objects].filter(key=>key.startsWith(target)).map(Key=>({Key})),IsTruncated:false};
    }
    if(command instanceof DeleteObjectsCommand){
      const keys=(command.input.Delete?.Objects??[]).map(item=>item.Key!);
      assert.ok(keys.every(key=>key.startsWith(target)));
      keys.forEach(key=>objects.delete(key));
      return {Errors:[]};
    }
    throw new Error("unexpected command");
  }} as unknown as S3Client;
  const storage=new PrivateMovieStorage(client,"movie-reels");
  assert.equal(await storage.deleteMovieFiles(id),2);
  assert.deepEqual([...objects],[other+"sources/file"]);
  assert.equal(await storage.deleteMovieFiles(id),0);
  assert.ok(reads>=3);
});

test("storage delete failure is surfaced and remaining objects can be retried",async()=>{
  const prefix=movieObjectPrefix(id),objects=new Set([prefix+"clips/0001/base.mp4"]);
  let fail=true;
  const client={send:async(command:unknown)=>{
    if(command instanceof ListObjectsV2Command)return {Contents:[...objects].map(Key=>({Key})),IsTruncated:false};
    if(command instanceof DeleteObjectsCommand){
      if(fail){fail=false;return {Errors:[{Key:[...objects][0],Code:"AccessDenied"}]};}
      objects.clear();return {Errors:[]};
    }
    throw new Error("unexpected command");
  }} as unknown as S3Client;
  const storage=new PrivateMovieStorage(client,"movie-reels");
  await assert.rejects(()=>storage.deleteMovieFiles(id),/MOVIE_STORAGE_DELETE_FAILED/);
  assert.equal(await storage.deleteMovieFiles(id),1);
  assert.equal(objects.size,0);
});
