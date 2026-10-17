/** Isolated existing QA branch only. No Meta calls and no production writes. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {getDb} from '../src/db';
import {EXPERIMENT_KEY,experimentTag} from '../src/services/reach-experiment-model';
import {measureReachExperiment,reachExperimentMeasurements} from '../src/services/reach-experiment-measure';
import {reserveExperimentBudgetQuery} from '../src/services/reach-experiment-queries';
if(!process.env.DATABASE_URL||new URL(process.env.DATABASE_URL).hostname!=='ep-muddy-shadow-b16f25bm.c-5.eu-central-1.aws.neon.tech')throw new Error('ISOLATED_AI_TEST_BRANCH_REQUIRED');
process.env.PUBLISHING_ENABLED='false';
const db=getDb(),page='99999999-0000-4000-8000-000000000002',second='99999999-0000-4000-8000-000000000003';
await db.execute(sql`INSERT INTO facebook_pages(id,name,facebook_page_id,platform,is_active,status) VALUES(${page}::uuid,'اختبار فقط — لا ينشر','999999999999999','facebook',true,'active'),(${second}::uuid,'اختبار قياس — لا ينشر','999999999999998','facebook',true,'active') ON CONFLICT(id) DO NOTHING`);
const now=Date.now(),experiment={id:randomUUID(),enabled:true,startsAt:new Date(now-86400000).toISOString(),endsAt:new Date(now+6*86400000).toISOString(),pageIds:[page,second]};
await db.execute(sql`INSERT INTO settings(key,value) VALUES(${EXPERIMENT_KEY},${JSON.stringify(experiment)}) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
await db.execute(sql`INSERT INTO settings(key,value) VALUES('reach_measure_tick','epoch') ON CONFLICT(key) DO UPDATE SET value='epoch'`);
const ids=[randomUUID(),randomUUID(),randomUUID()];
const seed=async(index:number,hours:number,fbId:string)=>db.execute(sql`INSERT INTO posts(id,page_id,content,status,category,facebook_post_id,published_at,tags)
 VALUES(${ids[index]}::uuid,${page}::uuid,'خبر اختبار لا يُنشر','published','أخبار',${fbId},${new Date(now-hours*3600000).toISOString()}::timestamptz,ARRAY[${experimentTag(experiment.id)}])`);
let reads=0;
const readPerformance=async(fbId:string)=>{reads++;return {available:true,metrics:[{key:'post_media_view',label:'المشاهدات',value:fbId==='999_1'?1200:fbId==='999_2'?20:1100}],fetchedAt:new Date().toISOString()};};
try{
 await seed(0,23.7,'999_1');await seed(1,24.2,'999_2');
 await measureReachExperiment({readPerformance});assert.equal(reads,2);
 await measureReachExperiment({readPerformance});assert.equal(reads,2,'a repeated tick does not re-read Graph');
 const early=await db.execute(sql`SELECT value::jsonb AS evidence FROM settings WHERE key=${'reach_24h:'+ids[0]}`);
 assert.equal((early.rows[0].evidence as {views:number}).views,1200);
 await seed(2,24.3,'999_3');
 await db.execute(sql`UPDATE settings SET value='epoch' WHERE key='reach_measure_tick'`);
 await measureReachExperiment({readPerformance});assert.equal(reads,3,'completed phase observations are not refetched');
 assert.deepEqual(await reachExperimentMeasurements(experiment.id),{measured:2,below:1,unknown:1,timely:0});
 for(let n=0;n<4;n++)assert.equal((await db.execute(reserveExperimentBudgetQuery(experiment.id,second,randomUUID()))).rows.length,1);
 assert.equal((await db.execute(reserveExperimentBudgetQuery(experiment.id,second,randomUUID()))).rows.length,0);
 console.log('Isolated reach QA passed: measurement phases, timely evidence, late-total uncertainty, repeat safety and four-attempt quota; 0 Meta requests.');
}finally{
 await db.execute(sql`UPDATE settings SET value=${JSON.stringify({...experiment,enabled:false})} WHERE key=${EXPERIMENT_KEY}`);
}
