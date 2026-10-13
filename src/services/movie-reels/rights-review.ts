import {sql} from "drizzle-orm";
import {z} from "zod";
export const rightsReviewSchema=z.object({decision:z.enum(["verified","rejected","revoked"]),expectedRevision:z.number().int().min(1),note:z.string().trim().min(10).max(2000),evidenceReviewed:z.literal(true)}).strict();
export function rightsReviewQuery(input:{movieId:string;reviewerId:string;allowedPages:ReadonlySet<string>|null;review:unknown}){
  z.uuid().parse(input.movieId);z.uuid().parse(input.reviewerId);
  const review=rightsReviewSchema.parse(input.review);
  const pages=[...(input.allowedPages??[])];for(const page of pages)z.uuid().parse(page);
  const scope=input.allowedPages===null?sql`true`:pages.length?sql`m.page_id IN (${sql.join(pages.map(page=>sql`${page}::uuid`),sql`,`)})`:sql`false`;
  return sql`WITH changed AS (
    UPDATE movie_assets m SET rights_status=${review.decision},
      rights_verified_by=CASE WHEN ${review.decision}='verified' THEN ${input.reviewerId}::uuid ELSE NULL END,
      rights_verified_at=CASE WHEN ${review.decision}='verified' THEN now() ELSE NULL END,
      rights_revision=rights_revision+1,updated_at=now()
    WHERE m.id=${input.movieId}::uuid AND m.rights_revision=${review.expectedRevision} AND ${scope}
      AND EXISTS(SELECT 1 FROM users u WHERE u.id=${input.reviewerId}::uuid AND u.is_active=true AND u.role IN ('admin','reviewer'))
      AND (${review.decision}<>'verified' OR (m.facebook_allowed=true AND m.excerpts_allowed=true
        AND length(btrim(coalesce(m.rights_evidence,'')))>=10 AND m.rights_basis IN ('owned','licensed','public_domain')
        AND (m.rights_expires_at IS NULL OR m.rights_expires_at>now())
        AND EXISTS(SELECT 1 FROM facebook_pages p WHERE p.id=m.page_id AND p.is_active=true AND p.platform='facebook')))
    RETURNING m.id,m.rights_status,m.rights_revision
  ), history AS (
    INSERT INTO movie_rights_reviews(movie_id,revision,reviewer_id,decision,note)
    SELECT id,rights_revision,${input.reviewerId}::uuid,rights_status,${review.note} FROM changed RETURNING id
  ), cancelled AS (
    UPDATE movie_publications p SET status='cancelled'
    WHERE p.status='scheduled' AND ${review.decision}<>'verified'
      AND p.clip_id IN(SELECT c.id FROM movie_clips c JOIN changed m ON m.id=c.movie_id) RETURNING p.id
  ), cleared AS (
    UPDATE movie_clips c SET approved_by=NULL,approved_at=NULL,subtitle_reviewed=false,scheduled_at=NULL,status='pending_approval',updated_at=now()
    WHERE ${review.decision}<>'verified' AND c.status IN ('approved','scheduled') AND c.movie_id IN(SELECT id FROM changed)
    RETURNING c.id
  ) SELECT changed.*, (SELECT count(*) FROM history) AS audit_count FROM changed`;
}
