import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assertMovieRights, planReelSchedule, riyadhDay, type Rights, type ReviewedClip } from "../src/services/movie-reels/policy";
const now = new Date("2026-10-13T00:00:00Z");
const rights: Rights = {status:"verified", verifiedBy:"reviewer", verifiedAt:now.toISOString(), expiresAt:null, facebookAllowed:true, excerptsAllowed:true};
const clip = (part: number): ReviewedClip => ({id:`clip-${part}`,part,durationMs:30000,approvedBy:"reviewer",approvedAt:now.toISOString(),status:"approved",outputKey:`private/${part}.mp4`,subtitleReviewed:true});
const input = () => ({rights,clips:[clip(1)],pageId:"page",allowedPages:new Set(["page"]),start:new Date("2026-10-13T06:00:00Z"),reservations:[],now});
test("rights verification and platform scope fail closed", () => {
  for (const status of ["pending","revoked","rejected"]) assert.throws(()=>assertMovieRights({...rights,status},now));
  assert.throws(()=>assertMovieRights({...rights,facebookAllowed:false},now));
  assert.throws(()=>assertMovieRights({...rights,expiresAt:now.toISOString()},now));
  assert.throws(()=>assertMovieRights({...rights,verifiedBy:null},now));
});
test("approval, subtitles, exact duration and explicit page are mandatory", () => {
  for (const change of [{approvedBy:null},{subtitleReviewed:false},{durationMs:29000},{status:"published"},{outputKey:null}]) assert.throws(()=>planReelSchedule({...input(),clips:[{...clip(1),...change}]}));
  assert.throws(()=>planReelSchedule({...input(),pageId:""}));
  assert.throws(()=>planReelSchedule({...input(),allowedPages:new Set()}));
});
test("sort parts, reserve at most five per Riyadh day and honor existing slots", () => {
  const reservations = [{clipId:"old",pageId:"page",scheduledAt:new Date("2026-10-13T05:00:00Z")}];
  const result = planReelSchedule({...input(),clips:Array.from({length:30},(_,i)=>clip(30-i)),reservations});
  assert.equal(result[0].clipId,"clip-1");
  const counts = new Map<string,number>();
  for(const slot of [...reservations,...result]) {const day=riyadhDay(slot.scheduledAt);counts.set(day,(counts.get(day)??0)+1);}
  assert.ok([...counts.values()].every(count=>count<=5));
});
test("no duplicates or schedules after license expiry", () => {
  assert.throws(()=>planReelSchedule({...input(),clips:[clip(1),clip(1)]}));
  assert.throws(()=>planReelSchedule({...input(),rights:{...rights,expiresAt:"2026-10-13T05:00:00Z"}}));
});
