import {eq} from 'drizzle-orm';
import {getDb} from '@/db';
import {settings} from '@/db/schema';
import {experimentSchema,EXPERIMENT_KEY,activeExperiment} from './reach-experiment-model';
import {reserveExperimentBudgetQuery} from './reach-experiment-queries';
export async function getReachExperiment(){
 const [row]=await getDb().select({value:settings.value}).from(settings).where(eq(settings.key,EXPERIMENT_KEY)).limit(1);
 if(!row)return null;
 // Corrupt policy must fail closed, not silently re-enable parallel publishers.
 return experimentSchema.parse(JSON.parse(row.value));
}
export async function experimentBlocksPage(pageId:string){return activeExperiment(await getReachExperiment(),pageId);}
export async function takeExperimentBudget(pageId:string,postId:string){
 const experiment=await getReachExperiment();
 if(!activeExperiment(experiment,pageId))return true;
 return !!(await getDb().execute(reserveExperimentBudgetQuery(experiment!.id,pageId,postId))).rows.length;
}
