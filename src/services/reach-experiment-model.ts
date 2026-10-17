import {z} from 'zod';
export const EXPERIMENT_KEY='reach_news_experiment_v1';
export const EXPERIMENT_LIMIT=4;
export const EXPERIMENT_HOURS=[9,13,17,21] as const;
export const experimentSchema=z.object({id:z.uuid(),enabled:z.boolean(),startsAt:z.iso.datetime(),endsAt:z.iso.datetime(),pageIds:z.array(z.uuid()).length(2)}).strict();
export type ReachExperiment=z.infer<typeof experimentSchema>;
export const experimentTag=(id:string)=>`reach-experiment:${id}`;
export function activeExperiment(value:ReachExperiment|null,pageId?:string,now=new Date()){
 return !!value&&value.enabled&&now.getTime()>=Date.parse(value.startsAt)&&now.getTime()<Date.parse(value.endsAt)&&(!pageId||value.pageIds.includes(pageId));
}
export function experimentSlot(value:ReachExperiment,pageId:string,now=new Date()){
 if(!activeExperiment(value,pageId,now))return null;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const field=(key:string)=>parts.find(p=>p.type===key)!.value;
 const day=`${field('year')}-${field('month')}-${field('day')}`,hour=Number(field('hour'));
 const slot=EXPERIMENT_HOURS.findLastIndex(h=>hour>=h);
 return slot<0?null:`reach-slot:${value.id}:${pageId}:${day}:${slot}`;
}
