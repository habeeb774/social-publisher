import {test} from "node:test";
import {strict as assert} from "node:assert";
import {platformPublishingEnabled,publishingControlSchema,publishingKey} from "../src/services/movie-reels/publishing-control";
test("publishing switches are independent, strict booleans, and fail closed",async()=>{
 const before={...process.env};
 try{
  process.env.MOVIE_REELS_ENABLED="true";process.env.MOVIE_YOUTUBE_ENABLED="true";
  process.env.YOUTUBE_CLIENT_ID="test";process.env.YOUTUBE_CLIENT_SECRET="test";
  process.env.YOUTUBE_REDIRECT_URI="https://example.test/api/youtube/callback";
  process.env.MOVIE_REELS_PUBLISHING_ENABLED="true";process.env.MOVIE_YOUTUBE_PUBLISHING_ENABLED="false";
  const store:Record<string,unknown>={};
  const read=async<T>(key:string,fallback:T)=> (key in store?store[key]:fallback) as T;
  assert.equal(await platformPublishingEnabled("facebook",read),true);
  assert.equal(await platformPublishingEnabled("youtube",read),false);
  store[publishingKey("facebook")]=false;store[publishingKey("youtube")]=true;
  assert.equal(await platformPublishingEnabled("facebook",read),false);
  assert.equal(await platformPublishingEnabled("youtube",read),true);
  store[publishingKey("youtube")]="true";
  assert.equal(await platformPublishingEnabled("youtube",read),false);
  store[publishingKey("youtube")]=true;delete process.env.YOUTUBE_CLIENT_SECRET;
  assert.equal(await platformPublishingEnabled("youtube",read),false);
  const failed=async<T>():Promise<T>=>{throw new Error("offline");};
  assert.equal(await platformPublishingEnabled("facebook",failed),false);
  store[publishingKey("facebook")]=true;delete process.env.MOVIE_REELS_ENABLED;
  assert.equal(await platformPublishingEnabled("facebook",read),false);
 }finally{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
});
test("switch requests require a known platform, boolean and explicit confirmation",()=>{
 for(const platform of ["facebook","youtube"])for(const enabled of [true,false])
  assert.equal(publishingControlSchema.safeParse({platform,enabled,confirmed:true}).success,true);
 for(const body of [{platform:"other",enabled:true,confirmed:true},{platform:"facebook",enabled:"false",confirmed:true},
  {platform:"youtube",enabled:true},{platform:"youtube",enabled:true,confirmed:false},{platform:"youtube",enabled:true,confirmed:true,rightsVerified:true}])
  assert.equal(publishingControlSchema.safeParse(body).success,false);
});
