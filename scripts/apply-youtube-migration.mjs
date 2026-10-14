import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';

// Run with a direct URL injected only for this process, and an explicitly checked host.
// Never pulls envs, prints credentials, pushes a schema, or touches existing movie rows.
try {
 const url=new URL(process.env.YOUTUBE_MIGRATION_DATABASE_URL);
 if(!process.env.YOUTUBE_EXPECTED_DATABASE_HOST||url.hostname!==process.env.YOUTUBE_EXPECTED_DATABASE_HOST||url.hostname.includes('-pooler'))throw new Error('TARGET_MISMATCH');
 const client=neon(url.href);
 const source=readFileSync(new URL('../drizzle/0024_movie_youtube.sql',import.meta.url),'utf8');
 const present=await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('youtube_channels','youtube_oauth_states','movie_youtube_rights','movie_youtube_rights_history','movie_youtube_publications')");
 if(present[0].n!==0)throw new Error(present[0].n===5?'MIGRATION_ALREADY_PRESENT':'MIGRATION_PARTIALLY_PRESENT');
 const text=source.replace(/^--.*$/gm,''),statements=[];
 let part='',dollar=false,quote=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(!quote&&text.slice(i,i+2)==='$$'){dollar=!dollar;part+='$$';i++;continue;}
  if(!dollar&&c==="'")quote=!quote;
  if(c===';'&&!dollar&&!quote){if(part.trim())statements.push(part.trim());part='';}else part+=c;
 }
 if(part.trim())statements.push(part.trim());
 if(dollar||quote||statements.length!==12)throw new Error('SQL_SPLIT_FAILED');
 await client.transaction([
  client.query("SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','30s',true)"),
  ...statements.map(statement=>client.query(statement)),
 ]);
 const [counts]=await client.query('SELECT (SELECT count(*)::int FROM movie_assets) AS movies,(SELECT count(*)::int FROM movie_clips) AS clips,(SELECT count(*)::int FROM movie_youtube_publications) AS youtube_publications');
 console.log(JSON.stringify({migration:'0024_movie_youtube',status:'applied',sha256:createHash('sha256').update(source).digest('hex'),counts}));
} catch(error) {
 const local=['TARGET_MISMATCH','MIGRATION_ALREADY_PRESENT','MIGRATION_PARTIALLY_PRESENT','SQL_SPLIT_FAILED'];
 console.error(JSON.stringify({migration:'0024_movie_youtube',status:'failed',code:local.includes(error?.message)?error.message:error?.code??'MIGRATION_FAILED'}));
 process.exitCode=1;
}
