export const REACH_TARGET=1000;
export const REACH_WINDOW_MS=24*3600000;
export type ReachState='in_progress'|'met_within_window'|'below_after_window'|'timing_unknown'|'unavailable';
export const REACH_LABELS:Record<ReachState,string>={
 in_progress:'ما زال داخل أول 24 ساعة',
 met_within_window:'رُصد بلوغ 1000 خلال أول 24 ساعة',
 below_after_window:'انتهت 24 ساعة والعدد الحالي دون 1000',
 timing_unknown:'بلغ 1000 لكن وقت بلوغها غير موثق',
 unavailable:'لا تتوفر بيانات كافية للتقييم',
};
/** Lifetime views read after the deadline cannot prove first-day success.
 * Missing metrics are never interpreted as zero. This is an observation, not
 * a promise of reach or a historical first-24-hours attribution model. */
export type ReachEvidence={publishedAt:string;observedAt:string;views:number};
export function reachGoal(publishedAt:Date|string|null,views:number|undefined,observedAt:Date|string,evidence?:ReachEvidence){
 const published=publishedAt===null?NaN:new Date(publishedAt).getTime(),observed=new Date(observedAt).getTime();
 const valid=Number.isFinite(published)&&Number.isFinite(observed)&&observed>=published&&typeof views==='number'&&Number.isFinite(views)&&views>=0;
 let state:ReachState='unavailable';
 if(valid){
  const within=observed-published<=REACH_WINDOW_MS;
  state=within?((views??0)>=REACH_TARGET?'met_within_window':'in_progress'):((views??0)>=REACH_TARGET?'timing_unknown':'below_after_window');
 }
 if(evidence&&Number.isFinite(published)&&new Date(evidence.publishedAt).getTime()===published&&Number.isFinite(evidence.views)&&evidence.views>=REACH_TARGET){
  const recorded=new Date(evidence.observedAt).getTime();
  if(recorded>=published&&recorded-published<=REACH_WINDOW_MS&&recorded<=observed)state='met_within_window';
 }
 return {state,label:REACH_LABELS[state],views:valid?views:null,target:REACH_TARGET,deadline:Number.isFinite(published)?new Date(published+REACH_WINDOW_MS).toISOString():null};
}
