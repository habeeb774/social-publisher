import {NextResponse} from "next/server";
import {sql} from "drizzle-orm";
import {getDb} from "@/db";
import {pageSession} from "@/services/session-server";

export async function GET(){
  const session=await pageSession();
  if(!session)return NextResponse.json({error:"غير مصرح"},{status:401});
  try{
    const db=getDb();
    const [worker]=((await db.execute(sql`SELECT worker_id,last_poll_at,last_success_at,current_job_id,progress,last_error,updated_at FROM movie_worker_heartbeats ORDER BY last_poll_at DESC LIMIT 1`)).rows) as Array<{worker_id:string;last_poll_at:string;last_success_at:string|null;current_job_id:string|null;progress:number;last_error:string|null;updated_at:string}>;
    const [counts]=((await db.execute(sql`SELECT count(*) FILTER (WHERE status='queued')::int AS queued,count(*) FILTER (WHERE status='running')::int AS running,count(*) FILTER (WHERE status='failed')::int AS failed FROM movie_jobs`)).rows) as Array<{queued:number;running:number;failed:number}>;
    const lastPoll=worker?new Date(worker.last_poll_at).getTime():0;
    return NextResponse.json({online:Boolean(worker&&Date.now()-lastPoll<=90000),worker:worker?{id:worker.worker_id,lastPollAt:worker.last_poll_at,lastSuccessAt:worker.last_success_at,currentJobId:worker.current_job_id,progress:worker.progress,lastError:worker.last_error}:null,counts:counts??{queued:0,running:0,failed:0}});
  }catch(error){
    console.error("Movie worker status unavailable",{code:"MOVIE_WORKER_STATUS_UNAVAILABLE",detail:error instanceof Error?error.message.slice(0,120):undefined});
    return NextResponse.json({online:false,worker:null,counts:null,error:"حالة العامل غير متاحة"},{status:200});
  }
}
