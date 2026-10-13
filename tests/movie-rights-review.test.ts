import {strict as assert} from "node:assert";
import {test} from "node:test";
import {PgDialect} from "drizzle-orm/pg-core";
import {rightsReviewQuery,rightsReviewSchema} from "../src/services/movie-reels/rights-review";
const id="12345678-1234-4123-8123-123456789012";
const review={decision:"verified",expectedRevision:1,note:"فُحص الترخيص ونطاق النشر والمقتطفات",evidenceReviewed:true};
test("rights input requires evidence review and prevents client-selected verifier",()=>{
  assert.equal(rightsReviewSchema.safeParse(review).success,true);
  for(const changes of [{evidenceReviewed:false},{expectedRevision:0},{reviewerId:id},{rightsVerifiedAt:"now"},{note:""}])assert.equal(rightsReviewSchema.safeParse({...review,...changes}).success,false);
});
test("atomic rights write correlates current reviewer, page scope, license expiry and revision",()=>{
  const query=new PgDialect().sqlToQuery(rightsReviewQuery({movieId:id,reviewerId:id,allowedPages:new Set([id]),review}));
  assert.match(query.sql,/u\.is_active=true AND u\.role IN \('admin','reviewer'\)/);
  assert.match(query.sql,/m\.rights_revision=/);
  assert.match(query.sql,/m\.page_id IN/);
  assert.match(query.sql,/m\.rights_expires_at>now\(\)/);
  assert.match(query.sql,/INSERT INTO movie_rights_reviews/);
  assert.match(query.sql,/FROM changed/);
  assert.ok(query.params.includes(review.note));assert.ok(!query.sql.includes(review.note));
});
test("revocation cancels only unsent schedules and clears unpublished approval",()=>{
  const query=new PgDialect().sqlToQuery(rightsReviewQuery({movieId:id,reviewerId:id,allowedPages:new Set(),review:{...review,decision:"revoked"}}));
  assert.match(query.sql,/AND false/);
  assert.match(query.sql,/p\.status='scheduled'/);
  assert.match(query.sql,/c\.status IN \('approved','scheduled'\)/);
  assert.match(query.sql,/approved_by=NULL,approved_at=NULL/);
  assert.ok(query.params.includes("revoked"));
});
