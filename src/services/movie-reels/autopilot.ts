import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {getDb} from "@/db";
import {getSetting} from "../settings-store";
import {CATALOG,catalogAttribution,catalogIds,catalogKey,CATALOG_POLICY_KEY,licenseEvidence,type CatalogId} from "./catalog";
import {configuredMovieStorage,type MovieUploadSession} from "./private-storage";
import {finalizeUploadQueries,reservationsQuery,reserveScheduleQueries,runTransaction} from "./pipeline";
import {planReelSchedule,type ReviewedClip,type Reservation} from "./policy";
import {reserveYouTubeQueries} from "../youtube/pipeline";

export const autopilotConfigSchema=z.object({enabled:z.boolean(),pageId:z.uuid(),channelId:z.uuid(),madeForKids:z.boolean(),confirmed:z.literal(true)}).strict();
const policySchema=z.object({enabled:z.boolean(),version:z.literal(1),ownerId:z.uuid(),pageId:z.uuid(),channelId:z.uuid(),madeForKids:z.boolean()});
export type AutoPolicy=z.infer<typeof policySchema>;
type AutoAsset={movieId:string;catalogId:CatalogId;state:"queued"|"downloading"|"ready"|"blocked";attribution:string;attempts:number;
 leaseToken?:string;leaseExpiresAt?:string;sourceKey?:string;sourceSha256?:string;rightsRevision?:number;sessionId?:string;error?:string;qa?:Record<string,Quality>};
export const qualitySchema=z.object({part:z.number().int().min(1).max(5),sha256:z.string().regex(/^[a-f0-9]{64}$/),durationMs:z.number().min(29850).max(30150),width:z.literal(1080),height:z.literal(1920),codec:z.literal("h264"),captionsArabic:z.literal(true)}).strict();
type Quality=z.infer<typeof qualitySchema>;
const iso=(value:unknown)=>value?new Date(value as string).toISOString():null;
export async function autoPolicy(){try{return policySchema.parse(await getSetting(CATALOG_POLICY_KEY,null,{strict:true}));}catch{return null;}}
async function activePolicy(){
 const policy=await autoPolicy();if(!policy?.enabled||process.env.MOVIE_REELS_ENABLED!=="true")throw new Error("AUTOPILOT_PAUSED");
 const rows=await getDb().execute(sql`SELECT u.id FROM users u,facebook_pages p,youtube_channels ch WHERE u.id=${policy.ownerId}::uuid AND u.is_active AND u.role='admin'
 AND p.id=${policy.pageId}::uuid AND p.is_active AND p.platform='facebook' AND ch.id=${policy.channelId}::uuid AND ch.active AND ch.owner_user_id=u.id`);
 if(!rows.rows.length)throw new Error("AUTOPILOT_TARGET_UNAVAILABLE");return policy;
}
export async function configureAutopilot(ownerId:string,input:z.infer<typeof autopilotConfigSchema>){
 const next:AutoPolicy={enabled:input.enabled,version:1,ownerId,pageId:input.pageId,channelId:input.channelId,madeForKids:input.madeForKids};
 const db=getDb(),current=await autoPolicy();
 if(current&&(current.ownerId!==ownerId||current.pageId!==input.pageId||current.channelId!==input.channelId||current.madeForKids!==input.madeForKids))throw new Error("AUTOPILOT_POLICY_IMMUTABLE");
 const targets=await db.execute(sql`SELECT u.id FROM users u,facebook_pages p,youtube_channels ch WHERE u.id=${ownerId}::uuid AND u.is_active AND u.role='admin'
  AND p.id=${input.pageId}::uuid AND p.is_active AND p.platform='facebook' AND ch.id=${input.channelId}::uuid AND ch.active AND ch.owner_user_id=u.id`);
 if(!targets.rows.length)throw new Error("AUTOPILOT_TARGET_UNAVAILABLE");
 const statements=[sql`SELECT pg_advisory_xact_lock(hashtext('movie-autopilot'))`,
  sql`INSERT INTO settings(key,value) VALUES(${CATALOG_POLICY_KEY},${JSON.stringify(next)}) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()
   WHERE settings.value::jsonb->>'ownerId'=${ownerId} AND settings.value::jsonb->>'pageId'=${input.pageId} AND settings.value::jsonb->>'channelId'=${input.channelId} AND settings.value::jsonb->>'madeForKids'=${String(input.madeForKids)}`,
  sql`SELECT 1/((value::jsonb->>'ownerId'=${ownerId} AND value::jsonb->>'pageId'=${input.pageId} AND value::jsonb->>'channelId'=${input.channelId}
   AND value::jsonb->>'madeForKids'=${String(input.madeForKids)} AND value::jsonb->>'enabled'=${String(input.enabled)})::int) FROM settings WHERE key=${CATALOG_POLICY_KEY}`];
 if(input.enabled)for(const id of catalogIds){
  const movieId=randomUUID(),asset:AutoAsset={movieId,catalogId:id,state:"queued",attribution:catalogAttribution(id),attempts:0,qa:{}};
  statements.push(sql`WITH registered AS (INSERT INTO settings(key,value) VALUES(${"movie_autopilot_catalog:"+id},${JSON.stringify({movieId})}) ON CONFLICT(key) DO NOTHING RETURNING key)
   INSERT INTO settings(key,value) SELECT ${catalogKey(movieId)},${JSON.stringify(asset)} FROM registered`);
 }
 await runTransaction(statements);return next;
}
async function assetFor(movieId:string){z.uuid().parse(movieId);return await getSetting<AutoAsset|null>(catalogKey(movieId),null,{strict:true});}
export async function retryCatalogDownloads(ownerId:string){
 const policy=await activePolicy();if(policy.ownerId!==ownerId)throw new Error("AUTOPILOT_OWNER_REQUIRED");
 const result=await getDb().execute(sql`UPDATE settings s SET value=(s.value::jsonb||'{"state":"queued","attempts":0,"error":null}'::jsonb)::text,updated_at=now()
  WHERE s.key LIKE 'movie_autopilot_asset:%' AND s.value::jsonb->>'state'='blocked' AND s.value::jsonb->>'sessionId' IS NULL
  AND s.value::jsonb->>'error' LIKE 'HTTPError:%'
  AND EXISTS(SELECT 1 FROM movie_assets m WHERE m.id=(s.value::jsonb->>'movieId')::uuid AND m.owner_user_id=${ownerId}::uuid
   AND m.status='draft' AND m.rights_status='verified' AND m.rights_revision=1 AND m.source_storage_key IS NULL) RETURNING key`);
 return result.rows.length;
}
async function leasedAsset(movieId:string,token:string){
 const asset=await assetFor(movieId);
 if(!asset||asset.state!=="downloading"||asset.leaseToken!==token||!asset.leaseExpiresAt||Date.parse(asset.leaseExpiresAt)<Date.now())throw new Error("LEASE_LOST");return asset;
}
export async function leaseCatalog(){
 let policy:AutoPolicy;try{policy=await activePolicy();}catch{return null;}
 const token=randomUUID(),expires=new Date(Date.now()+30*60000).toISOString();
 const [rows]=await runTransaction([sql`WITH picked AS (SELECT key FROM settings WHERE key LIKE 'movie_autopilot_asset:%'
  AND ((value::jsonb->>'state'='queued') OR (value::jsonb->>'state'='downloading' AND (value::jsonb->>'leaseExpiresAt')::timestamptz<now()))
  AND (value::jsonb->>'attempts')::int<3 ORDER BY key FOR UPDATE SKIP LOCKED LIMIT 1)
  UPDATE settings s SET value=(s.value::jsonb||${JSON.stringify({state:"downloading",leaseToken:token,leaseExpiresAt:expires})}::jsonb||jsonb_build_object('attempts',(s.value::jsonb->>'attempts')::int+1))::text,updated_at=now()
   FROM picked WHERE s.key=picked.key RETURNING s.value`]);
 const row=(rows as Array<{value:string}>)[0];if(!row)return null;const asset=JSON.parse(row.value) as AutoAsset;
 try{
  if(!catalogIds.includes(asset.catalogId))throw new Error("CATALOG_UNKNOWN");
  const evidence=await licenseEvidence(asset.catalogId),film=CATALOG[asset.catalogId],note=`AUTOMATED_CATALOG_LICENSE_POLICY_V1; ${evidence.url}; sha256=${evidence.sha256}; consent owner=${policy.ownerId}`;
  // Separate history explicitly records a policy decision, not a fabricated human examination.
  await runTransaction([
   sql`INSERT INTO movie_assets(id,owner_user_id,page_id,title,rights_status,rights_basis,rights_revision,rights_verified_by,rights_verified_at,rights_evidence,facebook_allowed,excerpts_allowed,status)
    VALUES(${asset.movieId}::uuid,${policy.ownerId}::uuid,${policy.pageId}::uuid,${film.title},'verified','licensed',1,${policy.ownerId}::uuid,now(),${asset.attribution},true,true,'draft') ON CONFLICT(id) DO NOTHING`,
   sql`INSERT INTO movie_rights_reviews(movie_id,revision,reviewer_id,decision,note) SELECT id,rights_revision,${policy.ownerId}::uuid,'verified',${note} FROM movie_assets WHERE id=${asset.movieId}::uuid
    ON CONFLICT(movie_id,revision) DO NOTHING`,
   sql`INSERT INTO movie_youtube_rights(movie_id,rights_revision,verified_by,evidence) SELECT id,rights_revision,${policy.ownerId}::uuid,${asset.attribution} FROM movie_assets WHERE id=${asset.movieId}::uuid AND rights_status='verified' ON CONFLICT(movie_id) DO NOTHING`,
   sql`INSERT INTO movie_youtube_rights_history(movie_id,reviewer_id,decision,note) SELECT ${asset.movieId}::uuid,${policy.ownerId}::uuid,'verified',${note}
    WHERE NOT EXISTS(SELECT 1 FROM movie_youtube_rights_history WHERE movie_id=${asset.movieId}::uuid AND note LIKE 'AUTOMATED_CATALOG_LICENSE_POLICY_V1%')`,
   sql`INSERT INTO settings(key,value) VALUES(${"movie_autopilot_license:"+asset.movieId},${JSON.stringify(evidence)}) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`,
  ]);
  return {...asset,sourceUrl:film.sourceUrl,archive:film.archive,subtitlesUrl:film.subtitlesUrl};
 }catch(error){await blockCatalog(asset.movieId,token,error instanceof Error?error.message:"CATALOG_IMPORT_FAILED");return null;}
}
export async function blockCatalog(movieId:string,token:string,error:string){
 await getDb().execute(sql`UPDATE settings SET value=(value::jsonb||${JSON.stringify({state:"blocked",error:error.slice(0,200)})}::jsonb)::text,updated_at=now()
  WHERE key=${catalogKey(movieId)} AND value::jsonb->>'leaseToken'=${token} AND value::jsonb->>'state'='downloading'`);
}
export async function catalogHeartbeat(movieId:string,token:string){
 await leasedAsset(movieId,token);
 await getDb().execute(sql`UPDATE settings SET value=jsonb_set(value::jsonb,'{leaseExpiresAt}',to_jsonb((now()+interval '30 minutes')::text))::text,updated_at=now()
  WHERE key=${catalogKey(movieId)} AND value::jsonb->>'leaseToken'=${token}`);
}
export async function initCatalogUpload(movieId:string,token:string,size:number){
 await activePolicy();const asset=await leasedAsset(movieId,token),db=getDb();
 if(asset.sessionId)throw new Error("CATALOG_UPLOAD_EXISTS");
 const storage=configuredMovieStorage(),created=await storage.initiate(movieId,{name:`${asset.catalogId}.mp4`,size,type:"video/mp4"});
 const id=randomUUID();
 try{await runTransaction([
  sql`INSERT INTO movie_upload_sessions(id,movie_id,owner_user_id,storage_key,provider_upload_id,file_name,size_bytes,mime_type) SELECT ${id}::uuid,m.id,m.owner_user_id,${created.key},${created.uploadId},${asset.catalogId+".mp4"},${size},'video/mp4' FROM movie_assets m WHERE m.id=${movieId}::uuid AND m.status<>'deleting'`,
  sql`UPDATE settings SET value=(value::jsonb||${JSON.stringify({sessionId:id})}::jsonb)::text WHERE key=${catalogKey(movieId)} AND value::jsonb->>'leaseToken'=${token}`,
 ]);}catch(error){await storage.abort(created).catch(()=>null);throw error;}
 return {sessionId:id,parts:created.parts};
}
async function catalogSession(movieId:string,token:string){
 const asset=await leasedAsset(movieId,token);const [row]=(await getDb().execute(sql`SELECT id,storage_key,provider_upload_id,size_bytes,mime_type,status FROM movie_upload_sessions WHERE id=${asset.sessionId??null}::uuid AND movie_id=${movieId}::uuid`)).rows as Array<{id:string;storage_key:string;provider_upload_id:string;size_bytes:number|string;mime_type:string;status:string}>;
 if(!row||!["uploading","completing"].includes(row.status))throw new Error("CATALOG_UPLOAD_INVALID");
 const session:MovieUploadSession={key:row.storage_key,uploadId:row.provider_upload_id,size:Number(row.size_bytes),type:row.mime_type};return {row,session,asset};
}
export async function catalogUploadParts(movieId:string,token:string,numbers:number[]){await activePolicy();const {session}=await catalogSession(movieId,token);return configuredMovieStorage().signParts(session,numbers);}
export async function finishCatalogUpload(movieId:string,token:string,parts:Array<{number:number;etag:string}>,sourceSha256:string){
 await activePolicy();const {row,session,asset}=await catalogSession(movieId,token),storage=configuredMovieStorage();
 await getDb().execute(sql`UPDATE movie_upload_sessions SET status='completing' WHERE id=${row.id}::uuid`);
 if(row.status==="completing")await storage.verify(session);else await storage.complete(session,parts);
 await runTransaction([...finalizeUploadQueries(row.id,movieId),
  sql`UPDATE settings SET value=(value::jsonb||${JSON.stringify({state:"ready",sourceKey:session.key,sourceSha256,rightsRevision:1,qa:asset.qa??{}})}::jsonb)::text,updated_at=now() WHERE key=${catalogKey(movieId)} AND value::jsonb->>'leaseToken'=${token}`]);
}
export async function catalogInfo(movieId:string){const asset=await assetFor(movieId);return asset?.state==="ready"?{catalogId:asset.catalogId,sourceSha256:asset.sourceSha256}:null;}
export async function recordCatalogQuality(movieId:string,sourceSha256:string,items:Quality[]){
 const asset=await assetFor(movieId);if(!asset)return;
 if(asset.state!=="ready"||asset.sourceSha256!==sourceSha256)throw new Error("CATALOG_SOURCE_CHANGED");
 const qa=Object.fromEntries(items.map(item=>[String(item.part),qualitySchema.parse(item)]));
 await getDb().execute(sql`UPDATE settings SET value=jsonb_set(value::jsonb,'{qa}',coalesce(value::jsonb->'qa','{}'::jsonb)||${JSON.stringify(qa)}::jsonb)::text,updated_at=now() WHERE key=${catalogKey(movieId)} AND value::jsonb->>'sourceSha256'=${sourceSha256}`);
}
export async function advanceCatalog(){
 let policy:AutoPolicy;try{policy=await activePolicy();}catch{return {scheduled:0};}
 const db=getDb(),assets=(await db.execute(sql`SELECT value FROM settings WHERE key LIKE 'movie_autopilot_asset:%' AND value::jsonb->>'state'='ready' ORDER BY key`)).rows as Array<{value:string}>;
 for(const row of assets){
  const asset=JSON.parse(row.value) as AutoAsset;
  const failed=(await db.execute(sql`SELECT id FROM movie_assets WHERE id=${asset.movieId}::uuid AND status='failed'`)).rows;
  if(failed.length){await db.execute(sql`UPDATE settings SET value=(value::jsonb||'{"state":"blocked","error":"CATALOG_PROCESSING_FAILED"}'::jsonb)::text WHERE key=${catalogKey(asset.movieId)}`);continue;}
  const [movie]=(await db.execute(sql`SELECT * FROM movie_assets WHERE id=${asset.movieId}::uuid AND owner_user_id=${policy.ownerId}::uuid AND status='review_required'
   AND rights_status='verified' AND rights_revision=1 AND source_storage_key=${asset.sourceKey??null}`)).rows as Array<Record<string,unknown>>;
  if(!movie)continue;
  const clips=(await db.execute(sql`SELECT * FROM movie_clips WHERE movie_id=${asset.movieId}::uuid ORDER BY part_number`)).rows as Array<Record<string,unknown>>;
  if(!clips.length||clips.length>5||clips.some(c=>c.revision!==1||["rejected","excluded","render_failed"].includes(String(c.status))||!asset.qa?.[String(c.part_number)]||c.duration_ms!==30000||!c.output_storage_key))continue;
  const approvals=clips.filter(c=>c.status==="pending_approval"&&!c.approved_by);
  if(approvals.length){
   const ids=sql.join(approvals.map(c=>sql`${c.id}::uuid`),sql`,`);
   await db.execute(sql`WITH changed AS (UPDATE movie_clips c SET status='approved',approved_by=${policy.ownerId}::uuid,approved_at=now(),subtitle_reviewed=true,
    description=${asset.attribution},updated_at=now() WHERE c.id IN (${ids}) AND c.revision=1 AND c.status='pending_approval'
    AND EXISTS(SELECT 1 FROM settings s WHERE s.key=${CATALOG_POLICY_KEY} AND s.value::jsonb->>'enabled'='true') RETURNING id,revision)
    INSERT INTO movie_approvals(clip_id,revision,reviewer_id,decision,note) SELECT id,revision,${policy.ownerId}::uuid,'approved',
     'AUTOMATED_CATALOG_POLICY_V1: source-bound worker media/caption checks; authorized policy, not human subtitle review' FROM changed`);
   return {scheduled:0,approved:approvals.length};
  }
  const [clip]=clips.filter(c=>["approved","scheduled","published"].includes(String(c.status))&&c.approved_by&&c.subtitle_reviewed);
  // Advance the first part missing either platform, never republish an existing reservation.
  let selected:Record<string,unknown>|undefined,fbExists=false,ytExists=false;
  for(const c of clips){
   if(!["approved","scheduled","published"].includes(String(c.status)))continue;
   const existing=await db.execute(sql`SELECT 'facebook' AS platform FROM movie_publications WHERE clip_id=${c.id}::uuid AND status<>'cancelled'
    UNION ALL SELECT 'youtube' AS platform FROM movie_youtube_publications WHERE clip_id=${c.id}::uuid AND channel_id=${policy.channelId}::uuid AND status<>'cancelled'`);
   const platforms=(existing.rows as Array<{platform:string}>).map(p=>p.platform);fbExists=platforms.includes("facebook");ytExists=platforms.includes("youtube");
   if(!fbExists||!ytExists){selected=c;break;}
  }
  if(!clip||!selected)continue;
  const c=selected,reviewed:ReviewedClip={id:String(c.id),part:Number(c.part_number),durationMs:Number(c.duration_ms),approvedBy:String(c.approved_by),approvedAt:iso(c.approved_at),status:"approved",outputKey:String(c.output_storage_key),subtitleReviewed:true};
  const rights={status:"verified",verifiedBy:String(movie.rights_verified_by),verifiedAt:iso(movie.rights_verified_at),expiresAt:iso(movie.rights_expires_at),facebookAllowed:true,excerptsAllowed:true};
  const start=new Date(Date.now()+30*60000),queries=[sql`SELECT pg_advisory_xact_lock(hashtext('movie-autopilot'))`,sql`SELECT 1/((value::jsonb->>'enabled'='true')::int) FROM settings WHERE key=${CATALOG_POLICY_KEY} FOR UPDATE`];
  if(!fbExists){const booked=(await db.execute(reservationsQuery(policy.pageId))).rows as Array<{clip_id:string;page_id:string;scheduled_at:string}>;
   const reservations:Reservation[]=booked.map(p=>({clipId:p.clip_id,pageId:p.page_id,scheduledAt:new Date(p.scheduled_at)}));
   const slots=planReelSchedule({rights,clips:[reviewed],pageId:policy.pageId,allowedPages:null,start,reservations});queries.push(...reserveScheduleQueries({movieId:asset.movieId,pageId:policy.pageId,slots}));}
  if(!ytExists){const booked=(await db.execute(sql`SELECT clip_id,scheduled_at FROM movie_youtube_publications WHERE channel_id=${policy.channelId}::uuid AND status<>'cancelled'`)).rows as Array<{clip_id:string;scheduled_at:string}>;
   const reservations=booked.map(p=>({clipId:p.clip_id,pageId:policy.channelId,scheduledAt:new Date(p.scheduled_at)}));
   const slots=planReelSchedule({rights,clips:[reviewed],pageId:policy.channelId,allowedPages:null,start,reservations});
   queries.push(...reserveYouTubeQueries(asset.movieId,{user:{id:policy.ownerId,role:"admin"},allowed:null},{channelId:policy.channelId,start:start.toISOString(),privacy:"public",madeForKids:policy.madeForKids,syntheticMedia:false},slots));}
  await runTransaction(queries);return {scheduled:1};
 }
 return {scheduled:0};
}
