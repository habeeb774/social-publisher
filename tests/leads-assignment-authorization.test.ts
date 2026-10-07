import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLeadAssignmentAuthorization } from '../src/services/leads-assignment-authorization';
const id='148b497b-bf2b-4d70-887d-47da50e32086';
test('assignment snapshot fails closed for malformed scopes and catalogs',()=>{
  assert.equal(parseLeadAssignmentAuthorization('viewer',null,null),null);
  assert.equal(parseLeadAssignmentAuthorization('editor','{',null),null);
  const scope=JSON.stringify({unrestricted:false,pageIds:[id],accountIds:['account']});
  for(const catalog of ['{','{}','[{"id":"account","pageIds":true}]'])assert.equal(parseLeadAssignmentAuthorization('editor',scope,catalog),null);
  assert.equal(parseLeadAssignmentAuthorization('editor',null,null)?.unrestricted,true);
  assert.equal(parseLeadAssignmentAuthorization('admin','{','{')?.unrestricted,true);
});
test('assignment snapshot keeps raw settings and derives only selected account pages',()=>{
  const scope=JSON.stringify({unrestricted:false,pageIds:[id],accountIds:['account']});
  const catalog=JSON.stringify([{id:'account',pageIds:['remote','remote'],instagramIds:['instagram']},{id:'hidden',pageIds:['outside']}]);
  const result=parseLeadAssignmentAuthorization('editor',scope,catalog)!;
  assert.equal(result.scopeValue,scope);assert.equal(result.catalogValue,catalog);
  assert.deepEqual(result.pageIds,[id]);assert.deepEqual(result.remoteIds,['remote','instagram']);
  assert.equal(result.unrestricted,false);
});
