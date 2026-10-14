import {strict as assert} from "node:assert";
import {sql} from "drizzle-orm";
import {getDb} from "../src/db";
import {configureAutopilot,leaseCatalog,advanceCatalog,autoPolicy} from "../src/services/movie-reels/autopilot";
import {catalogKey} from "../src/services/movie-reels/catalog";
import {leasePublicationQuery} from "../src/services/movie-reels/pipeline";
if(!process.env.DATABASE_URL||new URL(process.env.DATABASE_URL).hostname!=="ep-old-dew-b1l3o12n.c-5.eu-central-1.aws.neon.tech")throw new Error("ISOLATED_TEST_BRANCH_REQUIRED");
process.env.MOVIE_REELS_ENABLED="true";
const db=getDb();
const [target]=(await db.execute(sql`SELECT u.id AS owner,p.id AS page,ch.id AS channel FROM youtube_channels ch JOIN users u ON u.id=ch.owner_user_id
 CROSS JOIN facebook_pages p WHERE ch.active AND u.is_active AND u.role='admin' AND p.is_active AND btrim(p.name)='افلام ومسلسلات' LIMIT 1`)).rows as Array<{owner:string;page:string;channel:string}>;
assert.ok(target);
await configureAutopilot(target.owner,{enabled:true,pageId:target.page,channelId:target.channel,madeForKids:false,confirmed:true});
await configureAutopilot(target.owner,{enabled:true,pageId:target.page,channelId:target.channel,madeForKids:false,confirmed:true});
const registered=(await db.execute(sql`SELECT count(*) AS n FROM settings WHERE key LIKE 'movie_autopilot_asset:%'`)).rows as Array<{n:string}>;
assert.equal(Number(registered[0].n),2);
await db.execute(sql`UPDATE settings SET value=(value::jsonb||'{"state":"queued","attempts":0}'::jsonb)::text WHERE key LIKE 'movie_autopilot_asset:%'`);
for(let i=0;i<2;i++){
 const job=await leaseCatalog();assert.ok(job);
 const source=`movies/${job.movieId}/sources/11111111-1111-4111-8111-111111111111`,qa=Object.fromEntries([1,2,3,4,5].map(part=>[part,{part,sha256:"a".repeat(64),durationMs:30000,width:1080,height:1920,codec:"h264",captionsArabic:true}]));
 await db.execute(sql`UPDATE settings SET value=(value::jsonb||${JSON.stringify({state:"ready",sourceKey:source,sourceSha256:"b".repeat(64),rightsRevision:1,qa})}::jsonb)::text WHERE key=${catalogKey(job.movieId)}`);
 await db.execute(sql`UPDATE movie_assets SET source_storage_key=${source},status='review_required' WHERE id=${job.movieId}::uuid`);
 for(let part=1;part<=5;part++)await db.execute(sql`INSERT INTO movie_clips(movie_id,part_number,start_ms,duration_ms,title,output_storage_key,status)
  VALUES(${job.movieId}::uuid,${part},${part*30000},30000,'test catalogue reel',${`movies/${job.movieId}/clips/000${part}/r1.mp4`},'pending_approval') ON CONFLICT(movie_id,part_number) DO NOTHING`);
}
for(let n=0;n<14;n++)await advanceCatalog();
const counts=(await db.execute(sql`SELECT (SELECT count(*) FROM movie_publications p JOIN movie_clips c ON c.id=p.clip_id JOIN settings s ON s.key='movie_autopilot_asset:'||c.movie_id::text) AS fb,
 (SELECT count(*) FROM movie_youtube_publications p JOIN settings s ON s.key='movie_autopilot_asset:'||p.movie_id::text) AS yt`)).rows as Array<{fb:string;yt:string}>;
assert.equal(Number(counts[0].fb),10);assert.equal(Number(counts[0].yt),10);
const violations=(await db.execute(sql`SELECT count(*) AS n FROM (SELECT (scheduled_at AT TIME ZONE 'Asia/Riyadh')::date d,count(*) n FROM movie_publications WHERE page_id=${target.page}::uuid GROUP BY d HAVING count(*)>5) q`)).rows as Array<{n:string}>;
assert.equal(Number(violations[0].n),0);
const policy=await autoPolicy();assert.ok(policy);
await configureAutopilot(target.owner,{enabled:false,pageId:target.page,channelId:target.channel,madeForKids:false,confirmed:true});
assert.equal(await leaseCatalog(),null);
assert.deepEqual(await advanceCatalog(),{scheduled:0});
await db.execute(sql`UPDATE movie_publications SET scheduled_at=now()-interval '1 minute' WHERE clip_id IN(SELECT c.id FROM movie_clips c JOIN settings s ON s.key='movie_autopilot_asset:'||c.movie_id::text)`);
const eligible=await db.execute(leasePublicationQuery());assert.equal(eligible.rows.length,0);
console.log(JSON.stringify({isolatedBranch:"passed",imports:2,duplicateImports:0,facebookReservations:10,youtubeReservations:10,quotaViolations:0,pausedLease:"blocked",liveUploads:0}));
