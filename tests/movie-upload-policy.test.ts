import {strict as assert} from "node:assert";
import {test} from "node:test";
import {isIsoVideoHeader,movieFileSchema,uploadPartPlan,privateMovieKey,MOVIE_MAX_BYTES,MOVIE_PART_BYTES} from "../src/services/movie-reels/upload-policy";
test("multipart plans cover bytes exactly with bounded part count",()=>{
  for(const size of [1,MOVIE_PART_BYTES,MOVIE_PART_BYTES+1,MOVIE_MAX_BYTES]){
    const plan=uploadPartPlan(size);assert.equal(plan.reduce((sum,p)=>sum+p.size,0),size);
    assert.ok(plan.length<=800);assert.equal(plan[0].offset,0);
    assert.equal(plan.at(-1)!.offset+plan.at(-1)!.size,size);
  }
  for(const size of [0,-1,NaN,Infinity,MOVIE_MAX_BYTES+1])assert.throws(()=>uploadPartPlan(size));
});
test("file policy rejects mismatched types and caller-selected object paths",()=>{
  assert.equal(movieFileSchema.safeParse({name:"film.mp4",size:12,type:"video/mp4"}).success,true);
  assert.equal(movieFileSchema.safeParse({name:"film.exe",size:12,type:"video/mp4"}).success,false);
  assert.throws(()=>privateMovieKey("../other","bad"));
  assert.equal(isIsoVideoHeader(Buffer.from("0000ftypisom")),true);
  assert.equal(isIsoVideoHeader(Buffer.from("<html>error</html>")),false);
});
