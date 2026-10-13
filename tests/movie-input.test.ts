import {strict as assert} from "node:assert";
import {test} from "node:test";
import {createMovieSchema,movieDraft} from "../src/services/movie-reels/input";
const id="12345678-1234-4123-8123-123456789012";
const valid={title:"فيديو مرخص",pageId:id,rightsBasis:"owned",rightsEvidence:"أملك الفيديو الأصلي وحقوق نشر مقتطفاته",facebookAllowed:true,excerptsAllowed:true,declaration:true};
test("creation never accepts approval, arbitrary source locator or other owner",()=>{
  for(const extra of [{rightsStatus:"verified"},{ownerUserId:id},{sourceStorageKey:"external"},{approvedBy:id}]) assert.equal(createMovieSchema.safeParse({...valid,...extra}).success,false);
  for(const change of [{pageId:""},{declaration:false},{facebookAllowed:false},{rightsEvidence:""}]) assert.equal(createMovieSchema.safeParse({...valid,...change}).success,false);
});
test("valid declaration saves only a pending owned draft",()=>{
  const draft=movieDraft(createMovieSchema.parse(valid),id);
  assert.equal(draft.rightsStatus,"pending");assert.equal(draft.status,"draft");
  assert.equal(draft.rightsVerifiedBy,null);assert.equal(draft.sourceStorageKey,null);
  assert.equal(draft.ownerUserId,id);
});
test("bootstrap owner and expired license are refused",()=>{
  assert.throws(()=>movieDraft(createMovieSchema.parse(valid),"env-admin"));
  assert.throws(()=>movieDraft(createMovieSchema.parse({...valid,rightsExpiresAt:"2020-01-01T00:00:00Z"}),id));
});
