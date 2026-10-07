import test from "node:test";
import assert from "node:assert/strict";
import { pushConfiguration } from "../src/services/push-config";
import { createECDH } from "node:crypto";
const privateKey=Buffer.alloc(32,2).toString("base64url");
const curve=createECDH("prime256v1");curve.setPrivateKey(Buffer.from(privateKey,"base64url"));
const publicKey=curve.getPublicKey().toString("base64url");
test("push is unavailable without all server configuration and never exposes the private key",()=>{
  assert.deepEqual(pushConfiguration({}),{configured:false,publicKey:null});
  assert.deepEqual(pushConfiguration({NEXT_PUBLIC_VAPID_PUBLIC_KEY:publicKey}),{configured:false,publicKey:null});
  const result=pushConfiguration({NEXT_PUBLIC_VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:privateKey,VAPID_SUBJECT:"mailto:owner@example.com"});
  assert.deepEqual(result,{configured:true,publicKey});
  assert.equal(JSON.stringify(result).includes(privateKey),false);
});
test("malformed VAPID keys and insecure contacts are rejected",()=>{
  for(const subject of ["","http://example.com","javascript:alert(1)"]){assert.equal(pushConfiguration({NEXT_PUBLIC_VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:privateKey,VAPID_SUBJECT:subject}).configured,false);}
  assert.equal(pushConfiguration({NEXT_PUBLIC_VAPID_PUBLIC_KEY:"invalid",VAPID_PRIVATE_KEY:privateKey,VAPID_SUBJECT:"mailto:owner@example.com"}).configured,false);
  assert.equal(pushConfiguration({NEXT_PUBLIC_VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:Buffer.alloc(32,3).toString("base64url"),VAPID_SUBJECT:"mailto:owner@example.com"}).configured,false);
});
