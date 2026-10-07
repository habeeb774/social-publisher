import { sql } from "drizzle-orm";
import { z } from "zod";
import { type WorkspaceContext } from "./workspace-request";
import { workspacePostPermissionPredicate } from "./workspace-posts";

/** Lock eligible parents before removing dependents; any FK failure rolls back everything. */
export function purgePostsQuery(ids: string[], workspace?: WorkspaceContext) {
  z.array(z.uuid()).min(1).max(200).parse(ids);
  const scope=workspace?workspacePostPermissionPredicate(workspace,["posts.delete"]):sql`true`;
  return sql`WITH targets AS MATERIALIZED (
    SELECT posts.id FROM posts
    WHERE posts.id IN (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`,`)})
    AND posts.deleted_at IS NOT NULL AND posts.status='draft'
    AND NOT EXISTS(SELECT 1 FROM publication_attempts a WHERE a.post_id=posts.id)
    AND ${scope} FOR UPDATE OF posts
  ), media_removed AS (
    DELETE FROM post_media WHERE post_id IN (SELECT id FROM targets) RETURNING id
  ), versions_removed AS (
    DELETE FROM post_versions WHERE post_id IN (SELECT id FROM targets) RETURNING id
  ), notes_removed AS (
    DELETE FROM post_notes WHERE post_id IN (SELECT id FROM targets) RETURNING id
  ) DELETE FROM posts WHERE id IN (SELECT id FROM targets)
    AND (SELECT count(*) FROM media_removed)>=0
    AND (SELECT count(*) FROM versions_removed)>=0
    AND (SELECT count(*) FROM notes_removed)>=0
    RETURNING id`;
}
