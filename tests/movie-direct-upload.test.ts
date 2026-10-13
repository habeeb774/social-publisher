import {strict as assert} from "node:assert";
import {test} from "node:test";
import {directMovieUpload,UploadCompletionUnknown,type UploadPorts} from "../src/app/movies/direct-upload";
const file=new File(["0000ftypisom"],"licensed.mp4",{type:"video/mp4"});
const ports=():UploadPorts=>({initiate:async metadata=>{assert.equal(metadata.size,12);assert.ok(!("body" in metadata));return {id:"session"};},sign:async()=>({url:"https://storage.example/part",size:12}),put:async(_url,body,_signal,progress)=>{assert.equal(body.size,12);progress(12);return '"etag"';},complete:async(_id,parts)=>{assert.deepEqual(parts,[{number:1,etag:'"etag"'}]);},abort:async()=>undefined});
test("direct upload sends only metadata to initiation and file bytes to storage",async()=>{
  const phases:string[]=[];
  const result=await directMovieUpload(file,ports(),new AbortController().signal,p=>phases.push(p.phase));
  assert.equal(result.sessionId,"session");assert.deepEqual(phases,["uploading","uploading","verifying","done"]);
});
test("part errors retry same session boundedly, without another initialization",async()=>{
  const provider=ports();let initialized=0,attempts=0;
  provider.initiate=async()=>{initialized++;return {id:"session"};};
  provider.put=async()=>{if(++attempts<3)throw new Error("network");return '"etag"';};
  await directMovieUpload(file,provider,new AbortController().signal,()=>undefined);
  assert.equal(attempts,3);assert.equal(initialized,1);
});
test("ambiguous complete neither retries nor aborts and reports session for reconciliation",async()=>{
  const provider=ports();let completed=0,aborted=0;
  provider.complete=async()=>{completed++;throw new Error("lost response");};provider.abort=async()=>{aborted++;};
  await assert.rejects(()=>directMovieUpload(file,provider,new AbortController().signal,()=>undefined),error=>error instanceof UploadCompletionUnknown&&error.sessionId==="session");
  assert.equal(completed,1);assert.equal(aborted,0);
});
test("cancelled request never initiates an upload",async()=>{
  const controller=new AbortController();controller.abort();let called=false;
  const provider=ports();provider.initiate=async()=>{called=true;return {id:"x"};};
  await assert.rejects(()=>directMovieUpload(file,provider,controller.signal,()=>undefined));assert.equal(called,false);
});
test("oversized receipt is never sent to completion and triggers cleanup",async()=>{
  const provider=ports();let completed=false,aborted=false;
  provider.put=async()=>"x".repeat(201);
  provider.complete=async()=>{completed=true;};provider.abort=async()=>{aborted=true;};
  await assert.rejects(()=>directMovieUpload(file,provider,new AbortController().signal,()=>undefined),/MOVIE_UPLOAD_ETAG_MISSING/);
  assert.equal(completed,false);assert.equal(aborted,true);
});
