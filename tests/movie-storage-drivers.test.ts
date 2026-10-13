import {strict as assert} from "node:assert";
import {test} from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {configuredMovieStorage,PrivateMovieStorage} from "../src/services/movie-reels/private-storage";
import {LocalMovieStorage,localStorageConfig,verifyLocalRequest} from "../src/services/movie-reels/local-storage";
import {MOVIE_PART_BYTES} from "../src/services/movie-reels/upload-policy";
import {GET,PUT} from "../src/app/api/movies/local-storage/[...key]/route";

const movieId="12345678-1234-4123-8123-123456789012";
const dir=mkdtempSync(path.join(tmpdir(),"movie-storage-"));
const env={NODE_ENV:"test",MOVIE_STORAGE_DRIVER:"local",MOVIE_LOCAL_STORAGE_DIR:dir,MOVIE_LOCAL_STORAGE_SECRET:"x".repeat(40),MOVIE_LOCAL_STORAGE_BASE_URL:"http://localhost:3000"} as NodeJS.ProcessEnv;
test.after(()=>rmSync(dir,{recursive:true,force:true}));

const video=(size:number)=>{const b=Buffer.alloc(size,7);b.write("ftypisom",4,"latin1");return b;};
const ctx=(url:string)=>({params:Promise.resolve({key:new URL(url).pathname.replace("/api/movies/local-storage/","").split("/")})});
async function withEnv<T>(fn:()=>Promise<T>){
  const saved={...process.env};Object.assign(process.env,env);
  try{return await fn();}finally{for(const k of Object.keys(env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
}

test("env selects driver; s3 is default and local is refused in production",()=>{
  assert.ok(configuredMovieStorage(env) instanceof LocalMovieStorage);
  assert.throws(()=>configuredMovieStorage({NODE_ENV:"test"} as NodeJS.ProcessEnv),/MOVIE_PRIVATE_STORAGE_NOT_CONFIGURED/);
  assert.throws(()=>configuredMovieStorage({...env,MOVIE_STORAGE_DRIVER:"ftp"}),/MOVIE_STORAGE_DRIVER_INVALID/);
  assert.throws(()=>configuredMovieStorage({...env,NODE_ENV:"production"}),/FORBIDDEN_IN_PRODUCTION/);
  const s3={MOVIE_S3_ENDPOINT:"http://localhost:9000",MOVIE_S3_REGION:"auto",MOVIE_S3_BUCKET:"b",MOVIE_S3_ACCESS_KEY_ID:"k",MOVIE_S3_SECRET_ACCESS_KEY:"s"};
  assert.ok(configuredMovieStorage({...s3,NODE_ENV:"development"} as NodeJS.ProcessEnv) instanceof PrivateMovieStorage);
  assert.throws(()=>configuredMovieStorage({...s3,NODE_ENV:"production"} as NodeJS.ProcessEnv),/MOVIE_STORAGE_ENDPOINT_INVALID/);
  assert.ok(configuredMovieStorage({...s3,MOVIE_S3_ENDPOINT:"https://acct.r2.cloudflarestorage.com",NODE_ENV:"production"} as NodeJS.ProcessEnv) instanceof PrivateMovieStorage);
});

test("local driver refuses a missing or short signing secret",()=>{
  const {MOVIE_LOCAL_STORAGE_SECRET:_,...rest}=env;
  assert.throws(()=>localStorageConfig(rest as NodeJS.ProcessEnv),/MOVIE_LOCAL_STORAGE_SECRET_REQUIRED/);
  assert.throws(()=>localStorageConfig({...env,MOVIE_LOCAL_STORAGE_SECRET:"short"}),/MOVIE_LOCAL_STORAGE_SECRET_REQUIRED/);
  assert.equal(localStorageConfig(env).secret,"x".repeat(40));
});

test("local driver multipart round trip through the signed route",()=>withEnv(async()=>{
  const storage=configuredMovieStorage() as LocalMovieStorage;
  const bytes=video(MOVIE_PART_BYTES+100);
  const session=await storage.initiate(movieId,{name:"a.mp4",size:bytes.length,type:"video/mp4"});
  const signed=await storage.signParts(session,[1,2]);
  const parts:Array<{number:number;etag:string}>=[];
  for(const p of signed){
    const plan=session.parts[p.number-1];
    const body=bytes.subarray(plan.offset,plan.offset+plan.size);
    const res=await PUT(new Request(p.url,{method:"PUT",body}),ctx(p.url));
    assert.equal(res.status,200);
    parts.push({number:p.number,etag:res.headers.get("ETag")!});
  }
  await assert.rejects(()=>storage.complete(session,[parts[0],{number:2,etag:'"wrong"'}]),/MOVIE_UPLOAD_INCOMPLETE/);
  const done=await storage.complete(session,parts);
  assert.equal(done.size,bytes.length);
  await assert.rejects(()=>storage.complete(session,parts),/MOVIE_UPLOAD/);
  const read=await storage.signRead(session.key);
  const res=await GET(new Request(read,{headers:{Range:"bytes=4-11"}}),ctx(read));
  assert.equal(res.status,206);
  assert.equal(Buffer.from(await res.arrayBuffer()).toString("latin1"),"ftypisom");
  const clipKey=`movies/${movieId}/clips/0001/base.mp4`;
  assert.equal(await storage.clipExists(clipKey),false);
  const clipUrl=await storage.signClipWrite(clipKey);
  assert.equal((await PUT(new Request(clipUrl,{method:"PUT",body:video(64)}),ctx(clipUrl))).status,200);
  assert.equal((await storage.clipBytes(clipKey)).length,64);
}));

test("route rejects tampered, expired, wrong-method and wrong-size requests",()=>withEnv(async()=>{
  const storage=configuredMovieStorage() as LocalMovieStorage;
  const session=await storage.initiate(movieId,{name:"a.mp4",size:100,type:"video/mp4"});
  const [p]=await storage.signParts(session,[1]);
  const tampered=p.url.replace("size=100","size=99");
  assert.equal((await PUT(new Request(tampered,{method:"PUT",body:video(99)}),ctx(tampered))).status,403);
  assert.equal((await GET(new Request(p.url),ctx(p.url))).status,403);
  assert.equal((await PUT(new Request(p.url,{method:"PUT",body:video(50)}),ctx(p.url))).status,400);
  const q=new URL(p.url).searchParams,key=session.key;
  assert.throws(()=>verifyLocalRequest(storage.cfg,"PUT",key,q,Date.now()+3600_000),/EXPIRED/);
  const other=new LocalMovieStorage({...storage.cfg,secret:"y".repeat(40)});
  assert.throws(()=>verifyLocalRequest(other.cfg,"PUT",key,q),/SIGNATURE_INVALID/);
}));

test("traversal and malformed keys are rejected",()=>withEnv(async()=>{
  const storage=configuredMovieStorage() as LocalMovieStorage;
  const cfg=localStorageConfig(env);
  for(const key of[`movies/${movieId}/clips/0001/../../../../etc.mp4`,"../../secret",`movies/${movieId}/sources/..%2f..`])
    assert.throws(()=>verifyLocalRequest(cfg,"GET",key,new URLSearchParams()),/MOVIE_STORAGE_KEY_INVALID/);
  await assert.rejects(()=>storage.signRead("movies/../../x"),/MOVIE_STORAGE_KEY_INVALID/);
  await assert.rejects(()=>storage.abort({key:`movies/${movieId}/sources/${movieId}`,uploadId:"../../x"}),/MOVIE_UPLOAD_ID_INVALID/);
}));
