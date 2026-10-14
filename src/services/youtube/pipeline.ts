import {sql} from "drizzle-orm";
import {z} from "zod";
import {movieScope} from "../movie-reels/pipeline";
import {planReelSchedule,type ReviewedClip,type Rights,type Reservation} from "../movie-reels/policy";

export const youtubeScheduleSchema=z.object({channelId:z.uuid(),start:z.iso.datetime({offset:true}),privacy:z.enum(["private","unlisted","public"]),
 madeForKids:z.boolean(),syntheticMedia:z.boolean()}).strict();
export const youtubeRightsSchema=z.object({decision:z.enum(["verified","revoked"]),expectedRevision:z.number().int().positive(),
 evidence:z.string().trim().min(10).max(2000),youtubeAllowed:z.literal(true),excerptsAllowed:z.literal(true),evidenceReviewed:z.literal(true)}).strict();
export type Actor={id:string;role:string};
export type Scope={user:Actor;allowed:ReadonlySet<string>|null};
const uuid=(id:string)=>z.uuid().parse(id);
/** Reuse Riyadh slot planning, but never inherit Facebook platform permission. */
export function planYouTube(input:{rights:Rights;youtubeVerified:boolean;clips:ReviewedClip[];channelId:string;start:Date;reservations:Reservation[];now?:Date}){
 if(!input.youtubeVerified)throw new Error("YOUTUBE_RIGHTS_REQUIRED");
 return planReelSchedule({...input,rights:{...input.rights,facebookAllowed:true},clips:input.clips.map(clip=>({...clip,
  status:clip.status==="published"?"approved":clip.status})),pageId:input.channelId,allowedPages:null});
}
export function youtubeRightsQuery(movieId:string,scope:Scope,review:z.infer<typeof youtubeRightsSchema>){
 uuid(movieId);uuid(scope.user.id);
 return sql`WITH eligible AS (
  SELECT m.* FROM movie_assets m WHERE m.id=${movieId}::uuid AND ${movieScope(scope.user,scope.allowed)}
   AND m.rights_revision=${review.expectedRevision} AND m.status<>'deleting'
   AND EXISTS(SELECT 1 FROM users u WHERE u.id=${scope.user.id}::uuid AND u.is_active AND u.role IN ('admin','reviewer'))
   AND (${review.decision}='revoked' OR (m.rights_status='verified' AND m.rights_verified_by IS NOT NULL AND m.excerpts_allowed
      AND (m.rights_expires_at IS NULL OR m.rights_expires_at>now()))) FOR UPDATE
 ), revoked AS (
  DELETE FROM movie_youtube_rights WHERE movie_id IN (SELECT id FROM eligible) AND ${review.decision}='revoked' RETURNING movie_id
 ), verified AS (
  INSERT INTO movie_youtube_rights(movie_id,rights_revision,verified_by,evidence)
   SELECT id,rights_revision,${scope.user.id}::uuid,${review.evidence} FROM eligible WHERE ${review.decision}='verified'
   ON CONFLICT(movie_id) DO UPDATE SET rights_revision=excluded.rights_revision,verified_by=excluded.verified_by,evidence=excluded.evidence,verified_at=now() RETURNING movie_id
 ), cancelled AS (
  UPDATE movie_youtube_publications SET status='cancelled',updated_at=now()
  WHERE movie_id IN (SELECT id FROM eligible) AND status='scheduled' AND ${review.decision}='revoked' RETURNING id
 ), history AS (
  INSERT INTO movie_youtube_rights_history(movie_id,reviewer_id,decision,note)
   SELECT id,${scope.user.id}::uuid,${review.decision},${review.evidence} FROM eligible RETURNING id
 ) SELECT id FROM eligible`;
}
/** Lock and recheck every boundary in the same transaction as reservation. No clip state is changed. */
export function reserveYouTubeQueries(movieId:string,scope:Scope,input:z.infer<typeof youtubeScheduleSchema>,slots:Array<{clipId:string;scheduledAt:Date}>) {
 uuid(movieId);uuid(input.channelId);uuid(scope.user.id);
 if(!slots.length||slots.length>1000)throw new Error("YOUTUBE_SCHEDULE_EMPTY");
 const values=sql.join(slots.map(s=>sql`(${uuid(s.clipId)}::uuid,${s.scheduledAt.toISOString()}::timestamptz)`),sql`, `);
 return [
  sql`SELECT pg_advisory_xact_lock(hashtext('youtube-schedule:'||${input.channelId}))`,
  sql`SELECT id FROM youtube_channels WHERE id=${input.channelId}::uuid FOR UPDATE`,
  sql`SELECT id FROM movie_assets WHERE id=${movieId}::uuid FOR UPDATE`,
  sql`WITH wanted(clip_id,at) AS (VALUES ${values}), inserted AS (
   INSERT INTO movie_youtube_publications(movie_id,clip_id,channel_id,revision,rights_revision,scheduled_at,privacy,made_for_kids,synthetic_media)
   SELECT m.id,c.id,ch.id,c.revision,m.rights_revision,w.at,${input.privacy},${input.madeForKids},${input.syntheticMedia}
    FROM wanted w JOIN movie_clips c ON c.id=w.clip_id JOIN movie_assets m ON m.id=c.movie_id
    JOIN youtube_channels ch ON ch.id=${input.channelId}::uuid JOIN movie_youtube_rights r ON r.movie_id=m.id AND r.rights_revision=m.rights_revision
    WHERE m.id=${movieId}::uuid AND ${movieScope(scope.user,scope.allowed)} AND m.status<>'deleting'
     AND m.rights_status='verified' AND m.rights_verified_by IS NOT NULL AND m.rights_verified_at IS NOT NULL AND m.excerpts_allowed
     AND (m.rights_expires_at IS NULL OR m.rights_expires_at>w.at) AND w.at>now() AND ch.active
     AND (${scope.user.role}='admin' OR ch.owner_user_id=${scope.user.id}::uuid)
     AND EXISTS(SELECT 1 FROM users u WHERE u.id=${scope.user.id}::uuid AND u.is_active AND u.role IN ('admin','editor'))
     AND c.status IN ('approved','scheduled','published') AND c.duration_ms=30000 AND c.output_storage_key IS NOT NULL
     AND c.approved_by IS NOT NULL AND c.approved_at IS NOT NULL AND c.subtitle_reviewed
     AND EXISTS(SELECT 1 FROM movie_approvals a WHERE a.clip_id=c.id AND a.revision=c.revision AND a.decision='approved')
   ON CONFLICT(clip_id,channel_id) DO UPDATE SET revision=excluded.revision,rights_revision=excluded.rights_revision,scheduled_at=excluded.scheduled_at,
    privacy=excluded.privacy,made_for_kids=excluded.made_for_kids,synthetic_media=excluded.synthetic_media,status='scheduled',error_code=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=now()
    WHERE movie_youtube_publications.status='cancelled' AND movie_youtube_publications.remote_video_id IS NULL
   RETURNING id,channel_id,scheduled_at
  ), combined AS (
   SELECT scheduled_at FROM movie_youtube_publications WHERE channel_id=${input.channelId}::uuid AND status<>'cancelled'
   UNION ALL SELECT scheduled_at FROM inserted
  ), quota AS (SELECT (scheduled_at AT TIME ZONE 'Asia/Riyadh')::date d,count(*) n FROM combined GROUP BY d)
  SELECT 1 / ((count(*)=${slots.length} AND NOT EXISTS(SELECT 1 FROM quota WHERE n>5))::int) AS reserved FROM inserted`,
 ];
}
/** SQL expression used at lease time AND immediately before media transmission. */
const publishEligible=()=>sql`ch.active AND owner.is_active AND owner.role='admin' AND m.status<>'deleting' AND m.rights_status='verified'
 AND m.rights_verified_by IS NOT NULL AND m.rights_verified_at IS NOT NULL AND m.excerpts_allowed
 AND m.rights_revision=p.rights_revision AND r.rights_revision=m.rights_revision
 AND (m.rights_expires_at IS NULL OR m.rights_expires_at>now())
 AND c.revision=p.revision AND c.approved_by IS NOT NULL AND c.approved_at IS NOT NULL AND c.subtitle_reviewed
 AND c.status IN ('approved','scheduled','published') AND c.duration_ms=30000 AND c.output_storage_key IS NOT NULL
 AND EXISTS(SELECT 1 FROM movie_approvals a WHERE a.clip_id=c.id AND a.revision=c.revision AND a.decision='approved')`;
export function leaseYouTubeQueries(){return [
 sql`SELECT pg_advisory_xact_lock(hashtext('youtube-publish'))`,
 sql`UPDATE movie_youtube_publications SET status='outcome_unknown',error_code='YOUTUBE_LEASE_EXPIRED',updated_at=now()
  WHERE status='uploading' AND lease_expires_at<now()`,
 sql`WITH picked AS (
  SELECT p.id FROM movie_youtube_publications p JOIN movie_clips c ON c.id=p.clip_id JOIN movie_assets m ON m.id=p.movie_id
   JOIN youtube_channels ch ON ch.id=p.channel_id JOIN users owner ON owner.id=ch.owner_user_id
   JOIN movie_youtube_rights r ON r.movie_id=m.id
  WHERE p.status='scheduled' AND p.scheduled_at<=now() AND ${publishEligible()}
   AND NOT EXISTS(SELECT 1 FROM movie_youtube_publications earlier WHERE earlier.channel_id=p.channel_id AND earlier.movie_id=p.movie_id
    AND earlier.status IN ('scheduled','uploading','processing','outcome_unknown') AND earlier.scheduled_at<p.scheduled_at)
   AND NOT EXISTS(SELECT 1 FROM movie_youtube_publications running WHERE running.channel_id=p.channel_id AND running.status='uploading')
   AND (SELECT count(*) FROM movie_youtube_publications sent WHERE sent.channel_id=p.channel_id AND sent.status IN ('uploading','processing','published','private','unlisted','outcome_unknown')
    AND (sent.started_at AT TIME ZONE 'Asia/Riyadh')::date=(now() AT TIME ZONE 'Asia/Riyadh')::date)<5
   ORDER BY p.scheduled_at FOR UPDATE OF p,c,m,ch SKIP LOCKED LIMIT 1
 ), leased AS (
  UPDATE movie_youtube_publications p SET status='uploading',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '10 minutes',started_at=now(),updated_at=now()
   FROM picked WHERE p.id=picked.id RETURNING p.*
 ) SELECT p.*,c.title,c.description,c.output_storage_key,ch.channel_id AS google_channel_id,ch.refresh_token_enc
  FROM leased p JOIN movie_clips c ON c.id=p.clip_id JOIN youtube_channels ch ON ch.id=p.channel_id`,
];}
export function checkYouTubeLease(id:string,token:string){return sql`SELECT p.id FROM movie_youtube_publications p
 JOIN movie_clips c ON c.id=p.clip_id JOIN movie_assets m ON m.id=p.movie_id JOIN youtube_channels ch ON ch.id=p.channel_id
 JOIN users owner ON owner.id=ch.owner_user_id JOIN movie_youtube_rights r ON r.movie_id=m.id
 WHERE p.id=${uuid(id)}::uuid AND p.lease_token=${uuid(token)}::uuid AND p.status='uploading' AND p.lease_expires_at>now() AND ${publishEligible()}`;}
export function finishYouTube(id:string,token:string,result:{videoId?:string;error?:string;unknown?:boolean}){
 return sql`UPDATE movie_youtube_publications SET status=${result.videoId?"processing":result.unknown?"outcome_unknown":"failed"},
  remote_video_id=coalesce(${result.videoId??null},remote_video_id),error_code=${result.error??null},updated_at=now()
  WHERE id=${uuid(id)}::uuid AND lease_token=${uuid(token)}::uuid AND status IN ('uploading','outcome_unknown') RETURNING id`;
}
