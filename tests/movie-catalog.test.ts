import {test} from "node:test";
import {strict as assert} from "node:assert";
import {PgDialect} from "drizzle-orm/pg-core";
import {CATALOG,catalogIds,catalogAttribution,licenseEvidence,catalogPublicationGate} from "../src/services/movie-reels/catalog";
import {autopilotConfigSchema,qualitySchema} from "../src/services/movie-reels/autopilot";
test("catalogue is restricted to two official films and complete attribution",()=>{
 assert.deepEqual(catalogIds,["big-buck-bunny","tears-of-steel"]);
 for(const id of catalogIds){assert.equal(new URL(CATALOG[id].sourceUrl).hostname,"download.blender.org");const credit=catalogAttribution(id);assert.match(credit,/Blender Foundation/);assert.match(credit,/creativecommons.org\/licenses\/by\/3.0/);assert.match(credit,/تعديلات/);}
});
test("license evidence is saved only after checking the official license and credit",async()=>{
 const ok=(async()=>new Response('license http://creativecommons.org/licenses/by/3.0/ (c) copyright 2008')) as typeof fetch;
 const result=await licenseEvidence("big-buck-bunny",ok);assert.match(result.sha256,/^[a-f0-9]{64}$/);assert.ok(result.snapshot);assert.equal(result.url,CATALOG["big-buck-bunny"].licensePage);
 for(const html of ['license http://creativecommons.org/licenses/by-nc/3.0/ copyright 2008','no licensing'])await assert.rejects(licenseEvidence("big-buck-bunny",(async()=>new Response(html)) as typeof fetch),/CATALOG_LICENSE_CHANGED/);
 await assert.rejects(licenseEvidence("tears-of-steel",(async()=>new Response('',{status:503})) as typeof fetch),/CATALOG_LICENSE_UNAVAILABLE/);
});
test("quality checks and policy request cannot silently waive media checks",()=>{
 const quality={part:1,sha256:"a".repeat(64),durationMs:30000,width:1080,height:1920,codec:"h264",captionsArabic:true};
 assert.ok(qualitySchema.safeParse(quality).success);
 for(const change of [{width:720},{durationMs:29000},{codec:"h265"},{captionsArabic:false},{part:6}])assert.equal(qualitySchema.safeParse({...quality,...change}).success,false);
 assert.equal(autopilotConfigSchema.safeParse({enabled:true}).success,false);
 const gate=new PgDialect().sqlToQuery(catalogPublicationGate()).sql;assert.match(gate,/rightsRevision/);assert.match(gate,/position\(/);assert.match(gate,/ownerId/);assert.match(gate,/enabled/);
});
