import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {commentFailure} from '../src/services/comments/errors';

test('comment errors expose only exact allowlisted codes and Arabic messages',()=>{
  for(const text of ['postgres://private-host','secret-token','NOT_FOUND: private query','COMMENTS_REPLY_UNAVAILABLE token=secret','__proto__','constructor']){
    const result=commentFailure(new Error(text));
    assert.equal(result.status,503);assert.equal(result.code,'COMMENTS_INTERNAL_ERROR');
    assert.equal(JSON.stringify(result).includes(text),false);
  }
  assert.equal(commentFailure(new Error('COMMENT_NOT_FOUND')).status,404);
  assert.equal(commentFailure(new Error('REPLY_NOT_APPROVED')).status,409);
  const invalid=z.uuid().safeParse('bad-id');assert.equal(invalid.success,false);
  if(!invalid.success){const result=commentFailure(invalid.error);assert.equal(result.status,400);assert.match(result.error,/تحقق/);assert.equal(JSON.stringify(result).includes('bad-id'),false);}
});
