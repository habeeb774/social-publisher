import test from "node:test";
import assert from "node:assert/strict";
import { requestSearch } from "../src/app/ui/search-request";
test("search requests encode input and propagate cancellation without caching",async()=>{
  const controller=new AbortController();
  const fetcher:typeof fetch=async(url,options)=>{
    assert.equal(url,"/api/search?q=a%26b");assert.equal(options?.signal,controller.signal);assert.equal(options?.cache,"no-store");
    return Response.json({results:[{type:"عميل محتمل",label:"عميل",href:"/leads/id"}]});
  };
  assert.equal((await requestSearch("a&b",controller.signal,fetcher)).length,1);
});
test("search rejects failed and malformed responses rather than silently showing empty results",async()=>{
  for(const response of [new Response("private failure",{status:503}),Response.json({error:"failed"}),Response.json({results:[{type:"x",label:"x",href:"//outside.test"}]}),Response.json({results:[null]})]) {
    await assert.rejects(requestSearch("query",new AbortController().signal,async()=>response),/SEARCH_/);
  }
});
test("cancelled search cannot resolve through the transport",async()=>{
  const controller=new AbortController();
  const pending=requestSearch("old",controller.signal,async(_url,options)=>new Promise((_resolve,reject)=>{
    options?.signal?.addEventListener("abort",()=>reject(new DOMException("aborted","AbortError")),{once:true});
  }));
  controller.abort();await assert.rejects(pending,{name:"AbortError"});
});
