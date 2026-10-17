import {sql,type SQL} from 'drizzle-orm';
import {EXPERIMENT_KEY} from './reach-experiment-model';
/** Database-time guard also fences workers that loaded policy before activation. */
export const experimentBlocksOtherNews=(pageId:SQL)=>sql`EXISTS(SELECT 1 FROM settings e WHERE e.key=${EXPERIMENT_KEY}
 AND (e.value::jsonb->>'enabled')::boolean AND (e.value::jsonb->>'startsAt')::timestamptz<=now()
 AND (e.value::jsonb->>'endsAt')::timestamptz>now() AND (e.value::jsonb->'pageIds') ? (${pageId})::text)`;

export const ordinaryExperimentAllowed=(pageId:SQL,tags:SQL,category:SQL)=>sql`NOT EXISTS(SELECT 1 FROM settings e WHERE e.key=${EXPERIMENT_KEY}
 AND (e.value::jsonb->>'enabled')::boolean AND (e.value::jsonb->>'startsAt')::timestamptz<=now()
 AND (e.value::jsonb->>'endsAt')::timestamptz>now() AND (e.value::jsonb->'pageIds') ? (${pageId})::text
 AND (${category}='أخبار' OR EXISTS(SELECT 1 FROM unnest(${tags}) t WHERE t LIKE 'source:%'))
 AND NOT (('reach-experiment:'||(e.value::jsonb->>'id'))=ANY(${tags})))`;

/** Conservative attempt quota: unknown outcomes and retries consume a place.
 * Previously published news on activation day counts, so starting mid-day
 * cannot add four more posts on top of an already busy day. */
export function reserveExperimentBudgetQuery(id:string,pageId:string,postId:string){
 return sql`WITH prior AS (SELECT
  (SELECT count(*) FROM posts WHERE page_id=${pageId}::uuid AND id<>${postId}::uuid AND category='أخبار'
    AND ((status='published' AND published_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh')
    OR (status='publishing' AND updated_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh')))+
  (SELECT count(*) FROM ai_news_publications WHERE page_id=${pageId}::uuid AND reserved_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh')+
  (SELECT count(*) FROM elon_news_publications WHERE page_id=${pageId}::uuid AND reserved_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh') AS n)
 INSERT INTO settings(key,value) SELECT 'reach-budget:'||${id}||':'||${pageId}||':'||to_char(now() AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD'),jsonb_build_object('count',n+1)::text FROM prior WHERE n<4
 ON CONFLICT(key) DO UPDATE SET value=jsonb_build_object('count',(settings.value::jsonb->>'count')::int+1)::text,updated_at=now()
 WHERE (settings.value::jsonb->>'count')::int<4 RETURNING key`;
}
