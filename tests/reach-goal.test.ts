import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reachGoal} from '../src/services/reach-goal';
const at=new Date('2026-10-17T09:00:00Z');
const hours=(n:number)=>new Date(at.getTime()+n*3600000);
test('24-hour target distinguishes pending, timely success and late lifetime totals',()=>{
 assert.equal(reachGoal(at,0,hours(1)).state,'in_progress');
 assert.equal(reachGoal(at,999,hours(23)).state,'in_progress');
 assert.equal(reachGoal(at,1000,hours(24)).state,'met_within_window');
 assert.equal(reachGoal(at,1001,hours(25)).state,'timing_unknown');
 assert.equal(reachGoal(at,999,hours(25)).state,'below_after_window');
 assert.equal(reachGoal(at,0,hours(25)).views,0);
 assert.equal(reachGoal(at,0,hours(1)).deadline,hours(24).toISOString());
});
test('missing, malformed and future observations never count as zero or a target miss',()=>{
 for(const result of [reachGoal(at,undefined,hours(25)),reachGoal(null,1000,hours(25)),reachGoal('bad',1000,hours(25)),reachGoal(at,NaN,hours(25)),reachGoal(at,-1,hours(25)),reachGoal(at,1000,hours(-1))]){
  assert.equal(result.state,'unavailable');assert.equal(result.views,null);
 }
});
test('only a matching and timely recorded milestone proves first-day success after the deadline',()=>{
 const evidence={publishedAt:at.toISOString(),observedAt:hours(20).toISOString(),views:1001};
 assert.equal(reachGoal(at,1200,hours(48),evidence).state,'met_within_window');
 for(const change of [{publishedAt:hours(-24).toISOString()},{observedAt:hours(25).toISOString()},{observedAt:hours(-1).toISOString()},{views:999},{views:NaN}])assert.equal(reachGoal(at,1200,hours(48),{...evidence,...change}).state,'timing_unknown');
 assert.equal(reachGoal(at,999,hours(10),evidence).state,'in_progress','evidence from the future cannot be used');
});
