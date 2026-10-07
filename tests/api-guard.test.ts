import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createGuard } from "../src/services/api-guard";
import type { CurrentUser } from "../src/services/rbac";
const request=(method="POST",origin="https://local.example")=>new NextRequest("https://local.example/api/settings",{method,headers:{origin}});
const viewer:CurrentUser={id:"user-1",email:"test@example.com",name:"Test",role:"viewer"};
function setup(user:CurrentUser|null=viewer){
  const actors:string[]=[];
  const guard=createGuard({readSession:async()=>({userId:"user-1",role:"admin"}),readUser:async()=>user,bindActor:email=>actors.push(email)});
  return {guard,actors};
}
test("an old admin cookie cannot retain write or administrative permission after downgrade",async()=>{
  const {guard,actors}=setup();
  assert.equal((await guard(request(),true,"users.manage"))?.status,403);
  assert.equal((await guard(request()))?.status,403);
  assert.deepEqual(actors,[]);
});
test("current role grants only allowed actions and binds actor after authorization",async()=>{
  const {guard,actors}=setup();
  assert.equal(await guard(request("GET"),false,"content.read"),null);
  assert.deepEqual(actors,[viewer.email]);
});
test("disabled, removed, or mismatched accounts cannot use a signed session",async()=>{
  for(const user of [null,{...viewer,id:"different-user",role:"admin" as const}])assert.equal((await setup(user).guard(request()))?.status,401);
});
test("cross-origin writes are denied before reading account data",async()=>{
  let queried=false;
  const guard=createGuard({readSession:async()=>({userId:"user-1",role:"admin"}),readUser:async()=>{queried=true;return {...viewer,role:"admin"};},bindActor:()=>assert.fail("must not bind")});
  assert.equal((await guard(request("POST","https://external.example")))?.status,403);
  assert.equal(queried,false);
});
test("authorization outages fail closed without leaking database errors",async()=>{
  const guard=createGuard({readSession:async()=>({userId:"user-1",role:"admin"}),readUser:async()=>{throw new Error("private connection details");},bindActor:()=>assert.fail("must not bind")});
  const denied=await guard(request());
  assert.equal(denied?.status,503);
  assert.equal((await denied!.text()).includes("private connection details"),false);
});
test("unsigned requests never query users or bind an audit actor",async()=>{
  const guard=createGuard({readSession:async()=>null,readUser:async()=>assert.fail("must not query"),bindActor:()=>assert.fail("must not bind")});
  assert.equal((await guard(request()))?.status,401);
});
