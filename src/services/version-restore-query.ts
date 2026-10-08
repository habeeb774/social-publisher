import { sql } from "drizzle-orm";
import { z } from "zod";
import type { WorkspaceContext } from "./workspace-request";
import { workspacePostPermissionPredicate } from "./workspace-posts";
import { versionRestoreState } from "./version-restore-policy";

const mediaSchema = z.array(z.object({url:z.string().min(1),type:z.string().min(1),mimeType:z.string().nullable().optional()})).max(100);

/** All restored fields and the before-image commit together, or none do. */
export function versionRestoreQuery(input: {postId:string; updatedAt:Date; content:string; scheduledAt:Date|null; media:unknown; actor:string}, workspace?:WorkspaceContext) {
  z.uuid().parse(input.postId);
  const media = mediaSchema.parse(input.media);
  const state = versionRestoreState(input.scheduledAt);
  const permission = workspace ? workspacePostPermissionPredicate(workspace,["posts.edit"]) : sql`true`;
  return sql`WITH source AS MATERIALIZED (
    SELECT posts.* FROM posts WHERE posts.id=${input.postId}::uuid
      AND posts.deleted_at IS NULL AND posts.status IN ('draft','scheduled','pending_approval','approved')
      AND date_trunc('milliseconds',posts.updated_at)=${input.updatedAt.toISOString()}::timestamptz
      AND ${permission} FOR UPDATE
  ), saved AS (
    INSERT INTO post_versions(post_id,content,scheduled_at,status,media_snapshot,changed_by,reason)
    SELECT s.id,s.content,s.scheduled_at,s.status,
      coalesce((SELECT jsonb_agg(jsonb_build_object('url',m.url,'type',m.type,'mimeType',m.mime_type) ORDER BY m.created_at,m.id) FROM post_media m WHERE m.post_id=s.id),'[]'::jsonb),
      ${input.actor},'before_restore' FROM source s RETURNING post_id
  ), changed AS (
    UPDATE posts SET content=${input.content},status='draft'::post_status,
      scheduled_at=${state.scheduledAt?.toISOString() ?? null}::timestamptz,in_queue=false,
      updated_at=greatest(clock_timestamp(),posts.updated_at+interval '1 millisecond')
    FROM saved WHERE posts.id=saved.post_id RETURNING posts.id
  ), removed AS (
    DELETE FROM post_media WHERE post_id IN (SELECT id FROM changed) RETURNING id
  ), inserted AS (
    INSERT INTO post_media(post_id,url,type,mime_type)
    SELECT c.id,m.url,m.type,m."mimeType" FROM changed c
      CROSS JOIN jsonb_to_recordset(${JSON.stringify(media)}::jsonb) AS m(url text,type text,"mimeType" text)
      CROSS JOIN (SELECT count(*) FROM removed) dependency RETURNING id
  ) SELECT changed.id FROM changed CROSS JOIN (SELECT count(*) FROM inserted) finished`;
}
