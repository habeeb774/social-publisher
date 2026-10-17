import {sql,inArray} from 'drizzle-orm';
import {getDb} from '@/db';
import {settings} from '@/db/schema';
import {getReachExperiment} from './reach-experiment';
import {experimentTag} from './reach-experiment-model';
import {getPostPerformance} from './post-insights';
import {reachGoal,type ReachEvidence} from './reach-goal';

/** Reuse the existing scheduler; no new cron, paid service, or browser visit.
 * Two bounded observations per trial post: near the deadline and just after.
 * A late lifetime total never proves first-day success without early evidence.
 */
export async function measureReachExperiment(dependencies:{readPerformance?:typeof getPostPerformance}={}){
 const experiment=await getReachExperiment();
 if(!experiment||!experiment.enabled||Date.now()>Date.parse(experiment.endsAt)+26*3600000)return;
 const db=getDb();
 const claim=await db.execute(sql`INSERT INTO settings(key,value) VALUES('reach_measure_tick',now()::text)
  ON CONFLICT(key) DO UPDATE SET value=now()::text,updated_at=now() WHERE settings.value::timestamptz<now()-interval '15 minutes' RETURNING key`);
 if(!claim.rows.length)return;
 const rows=(await db.execute(sql`SELECT p.id,p.published_at,p.facebook_post_id,f.facebook_page_id FROM posts p JOIN facebook_pages f ON f.id=p.page_id
  WHERE p.status='published' AND p.deleted_at IS NULL AND p.facebook_post_id IS NOT NULL AND ${experimentTag(experiment.id)}=ANY(p.tags)
  AND p.published_at<=now()-interval '23 hours 30 minutes' AND p.published_at>=now()-interval '26 hours'
  ORDER BY p.published_at LIMIT 16`)).rows as Array<{id:string;published_at:string;facebook_post_id:string;facebook_page_id:string}>;
 const candidates=rows.map(row=>({...row,phase:Date.now()-new Date(row.published_at).getTime()<86400000?'before':'after'})).map(row=>({...row,key:`reach_sample:${experiment.id}:${row.id}:${row.phase}`}));
 const existing=candidates.length?await db.select({key:settings.key,value:settings.value}).from(settings).where(inArray(settings.key,candidates.flatMap(r=>[r.key,`reach_24h:${r.id}`]))):[];
 const seen=new Set(existing.map(r=>r.key));
 for(const row of candidates.filter(r=>!seen.has(r.key)).slice(0,2)){
  const perf=await (dependencies.readPerformance??getPostPerformance)(row.facebook_post_id,row.facebook_page_id);
  const views=perf.metrics.find(m=>m.key==='post_media_view')?.value;
  let evidence:ReachEvidence|undefined;
  try{evidence=JSON.parse(existing.find(r=>r.key===`reach_24h:${row.id}`)?.value??'null')??undefined;}catch{/* Invalid evidence cannot prove success. */}
  const goal=reachGoal(new Date(row.published_at),views,perf.fetchedAt,evidence);
  const value={postId:row.id,publishedAt:new Date(row.published_at).toISOString(),observedAt:perf.fetchedAt,views:views??null,state:goal.state};
  await db.insert(settings).values({key:row.key,value:JSON.stringify(value)}).onConflictDoNothing();
  if(goal.state==='met_within_window')await db.insert(settings).values({key:`reach_24h:${row.id}`,value:JSON.stringify(value)}).onConflictDoNothing();
 }
}

export async function reachExperimentMeasurements(id:string){
 const rows=await getDb().select({value:settings.value}).from(settings).where(sql`${settings.key} LIKE ${'reach_sample:'+id+':%:after'}`).limit(100);
 let below=0,unknown=0,measured=0,timely=0;
 for(const row of rows){try{const value=JSON.parse(row.value);measured++;if(value.state==='below_after_window')below++;else if(value.state==='met_within_window')timely++;else if(value.state==='timing_unknown'||value.state==='unavailable')unknown++;}catch{/* No fabricated measurements. */}}
 return {measured,below,unknown,timely};
}
