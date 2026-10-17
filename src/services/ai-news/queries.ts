import {sql} from 'drizzle-orm';
import {experimentBlocksOtherNews} from '../reach-experiment-queries';

export const CONFIG_KEY='ai_news_config';
export const RUNTIME_KEY='ai_news_runtime';
export const claimRunQuery=(token:string,markRun=true)=>sql`
 UPDATE settings SET value=(value::jsonb || jsonb_build_object('lease',${token}::text,'leaseUntil',now()+interval '270 seconds')
  || CASE WHEN ${markRun} THEN jsonb_build_object('lastRunAt',now()) ELSE '{}'::jsonb END)::text,updated_at=now()
 WHERE key=${RUNTIME_KEY} AND COALESCE((value::jsonb->>'leaseUntil')::timestamptz,'epoch')<now()
 RETURNING value::jsonb AS state`;
export const ownsRun=(token:string)=>sql`EXISTS(SELECT 1 FROM settings WHERE key=${RUNTIME_KEY}
 AND value::jsonb->>'lease'=${token} AND (value::jsonb->>'leaseUntil')::timestamptz>now())`;
export const activePolicy=(revision:string,pageId:string)=>sql`EXISTS(SELECT 1 FROM settings c JOIN users u ON u.id::text=c.value::jsonb->>'ownerId'
 WHERE c.key=${CONFIG_KEY} AND c.value::jsonb->>'revision'=${revision}
 AND (c.value::jsonb->>'monitoring')::boolean AND (c.value::jsonb->>'autoPublish')::boolean
 AND c.value::jsonb->>'pageId'=${pageId} AND u.is_active=true AND u.role='admin')`;

// Every possible send consumes quota, including unknown outcomes. Pauses/failed
// preflight do not. All quota decisions use database time in Asia/Riyadh.
export function beginSendQuery(input:{id:string;token:string;revision:string;pageId:string;limit:number;gap:number}){
 return sql`UPDATE ai_news_publications p SET status='publishing',reserved_at=now(),attempts=attempts+1,error_code=NULL
 WHERE p.id=${input.id}::uuid AND p.status IN ('queued','preflight') AND p.attempts<5 AND p.next_attempt_at<=now()
 AND ${ownsRun(input.token)} AND ${activePolicy(input.revision,input.pageId)}
 AND NOT ${experimentBlocksOtherNews(sql`${input.pageId}`)}
 AND EXISTS(SELECT 1 FROM facebook_pages f WHERE f.id=p.page_id AND f.id=${input.pageId}::uuid AND f.platform='facebook' AND f.is_active AND f.status='active')
 AND EXISTS(SELECT 1 FROM ai_news_stories s WHERE s.id=p.story_id AND s.status='verified' AND s.arabic_post IS NOT NULL AND (s.duplicate_of IS NULL OR s.verification->>'distinctConfirmed'='true')
  AND (s.verification->>'policy'<>'approved_source_direct_v1' OR EXISTS(
   SELECT 1 FROM settings c WHERE c.key=${CONFIG_KEY} AND c.value::jsonb->>'verificationMode'='approved_source'))
  AND (SELECT count(DISTINCT r.independence_group) FROM ai_news_reports r JOIN settings c ON c.key=${CONFIG_KEY}
       WHERE r.story_id=s.id AND (c.value::jsonb->'sourceIds') ? r.source_id)>=CASE
        WHEN s.verification->>'policy'='human_review' THEN 1
        WHEN s.verification->>'policy'='approved_source_direct_v1' AND EXISTS(
         SELECT 1 FROM settings c WHERE c.key=${CONFIG_KEY} AND c.value::jsonb->>'verificationMode'='approved_source') THEN 1
        ELSE 2 END)
 AND (SELECT count(*) FROM ai_news_publications q WHERE q.reserved_at AT TIME ZONE 'Asia/Riyadh' >= date_trunc('day',now() AT TIME ZONE 'Asia/Riyadh'))<${input.limit}
 AND NOT EXISTS(SELECT 1 FROM ai_news_publications q WHERE q.reserved_at>now()-make_interval(mins=>${input.gap}))
 RETURNING p.id,p.story_id,p.attempts`;
}
