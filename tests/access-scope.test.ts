import test from "node:test";
import assert from "node:assert/strict";
import { parseUserAccessScope } from "../src/services/access-scope-model";
import { parseSettingValue } from "../src/services/settings-store";
test("corrupt access scope JSON fails closed rather than using an unrestricted fallback",()=>{
  const fallback={unrestricted:true,accountIds:[],pageIds:[]};
  assert.throws(()=>parseSettingValue("{",fallback,{strict:true}),/SETTING_INVALID/);
  assert.deepEqual(parseSettingValue("{",fallback),fallback);
  assert.deepEqual(parseUserAccessScope(fallback),fallback);
});
test("scope validation denies missing flags, null, false-like strings and malformed collections",()=>{
  for(const value of [{},null,{unrestricted:"false"},{unrestricted:false,pageIds:["not-uuid"]},{unrestricted:false,accountIds:"all"}])assert.throws(()=>parseUserAccessScope(value),/ACCESS_SCOPE_INVALID/);
});
test("valid restricted scopes stay restricted and deduplicate page assignments",()=>{
  const id="acf36f18-958e-49d2-bd78-93ab243a9457";
  assert.deepEqual(parseUserAccessScope({unrestricted:false,pageIds:[id,id],accountIds:["account","account"]}),{unrestricted:false,pageIds:[id],accountIds:["account"]});
  assert.deepEqual(parseUserAccessScope({unrestricted:false}),{unrestricted:false,pageIds:[],accountIds:[]});
});
