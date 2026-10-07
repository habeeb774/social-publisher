import { sql } from "drizzle-orm";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { decodeCommentCursor, encodeCommentCursor } from "./comments/filters";
import { authorizeWorkspace, type WorkspaceContext, type WorkspaceRequestDependencies } from "./workspace-request";
import { WORKSPACE_PERMISSIONS, WORKSPACE_ROLES, type WorkspacePermission } from "./workspace-access";
import { posts } from "../db/schema";

const createFieldsSchema=z.object({content:z.string().min(1).max(63206),status:z.enum(["draft","scheduled","pending_approval"]),scheduledAt:z.date().nullable(),timezone:z.literal("Asia/Riyadh"),category:z.string().max(100).nullable().optional(),tags:z.array(z.string().max(40)).max(20).optional(),campaignId:z.null().optional()});
export type WorkspacePostCreateFields=z.input<typeof createFieldsSchema>;

/** INSERT ... SELECT makes current page ownership and author permission part of the write. */
export function workspacePostCreateQuery(context:WorkspaceContext,pageId:string,fields:WorkspacePostCreateFields,scheduling=false) {
  z.uuid().parse(context.userId);z.uuid().parse(context.workspaceId);z.uuid().parse(pageId);
  const data=createFieldsSchema.parse(fields);
  const mustPublish=scheduling || data.status!=="draft";
  const roles=WORKSPACE_PERMISSIONS["posts.create"].filter(role=>!mustPublish || (WORKSPACE_PERMISSIONS["posts.publish"] as readonly string[]).includes(role));
  return sql`INSERT INTO posts(page_id,content,status,scheduled_at,timezone,category,tags,created_by)
    SELECT wp.page_id,${data.content},${data.status}::post_status,${data.scheduledAt?.toISOString()??null}::timestamptz,${data.timezone},${data.category??null},ARRAY[${sql.join((data.tags??[]).map(tag=>sql`${tag}`),sql`,`)}]::text[],${context.userId}::uuid
    FROM workspace_pages wp
    JOIN workspaces w ON w.id=wp.workspace_id AND w.is_active=true
    JOIN facebook_pages fp ON fp.id=wp.page_id AND fp.is_active=true
    JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=${context.userId}::uuid AND m.is_active=true
    JOIN users u ON u.id=m.user_id AND u.is_active=true
    WHERE wp.workspace_id=${context.workspaceId}::uuid AND wp.page_id=${pageId}::uuid
    AND m.role IN (${sql.join(roles.map(role=>sql`${role}`),sql`,`)})
    RETURNING id`;
}

/** Correlated predicate for reads and writes; never authorize from the context's historical role. */
export function workspacePostEditPredicate(context:WorkspaceContext, scheduling=false) {
  return workspacePostPermissionPredicate(context,scheduling?["posts.edit","posts.publish"]:["posts.edit"]);
}

export function workspacePostPermissionPredicate(context:WorkspaceContext, permissions:readonly WorkspacePermission[]) {
  z.uuid().parse(context.userId); z.uuid().parse(context.workspaceId);
  if(!permissions.length)throw new Error("WORKSPACE_PERMISSION_REQUIRED");
  const roles=WORKSPACE_ROLES.filter(role=>permissions.every(permission=>(WORKSPACE_PERMISSIONS[permission] as readonly string[]).includes(role)));
  return sql`EXISTS (SELECT 1 FROM workspace_pages wp
    JOIN workspaces w ON w.id=wp.workspace_id AND w.is_active=true
    JOIN facebook_pages fp ON fp.id=wp.page_id AND fp.is_active=true
    JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=${context.userId}::uuid AND m.is_active=true
    JOIN users u ON u.id=m.user_id AND u.is_active=true
    WHERE wp.page_id=${posts.pageId} AND wp.workspace_id=${context.workspaceId}::uuid
    AND ${roles.length?sql`m.role IN (${sql.join(roles.map(role=>sql`${role}`),sql`,`)})`:sql`false`})`;
}

const pageSchema = z.object({limit:z.coerce.number().int().min(1).max(100).default(50),cursor:z.string().max(1024).nullable().default(null)});
export type WorkspacePostPage = {limit:number; cursor:ReturnType<typeof decodeCommentCursor>};
export function parseWorkspacePostPage(params:URLSearchParams):WorkspacePostPage {
  const input = pageSchema.parse({limit:params.get("limit") ?? undefined,cursor:params.get("cursor")});
  return {limit:input.limit,cursor:decodeCommentCursor(input.cursor)};
}

export function workspacePostListQuery(context:WorkspaceContext, page:WorkspacePostPage) {
  z.uuid().parse(context.userId); z.uuid().parse(context.workspaceId);
  z.number().int().min(1).max(100).parse(page.limit);
  if (page.cursor) z.object({time:z.iso.datetime(),id:z.uuid()}).parse(page.cursor);
  const cursor = page.cursor ? sql`AND (p.created_at,p.id) < (${page.cursor.time}::timestamptz,${page.cursor.id}::uuid)` : sql``;
  return sql`SELECT p.id, p.page_id AS "pageId", p.content, p.status,
    to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
    to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt",
    to_char(p.scheduled_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "scheduledAt",
    to_char(p.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "publishedAt"
    FROM posts p
    JOIN workspace_pages wp ON wp.page_id=p.page_id AND wp.workspace_id=${context.workspaceId}::uuid
    JOIN workspaces w ON w.id=wp.workspace_id AND w.is_active=true
    JOIN facebook_pages fp ON fp.id=wp.page_id AND fp.is_active=true
    JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=${context.userId}::uuid AND m.is_active=true
    JOIN users u ON u.id=m.user_id AND u.is_active=true
    WHERE p.deleted_at IS NULL AND m.role IN (${sql.join(WORKSPACE_PERMISSIONS["posts.read"].map(role => sql`${role}`),sql`,`)})
    ${cursor} ORDER BY p.created_at DESC,p.id DESC LIMIT ${page.limit+1}`;
}

const postSchema = z.object({id:z.uuid(),pageId:z.uuid(),content:z.string(),status:z.enum(["draft","scheduled","publishing","published","failed","cancelled","archived","pending_approval","approved"]),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),scheduledAt:z.iso.datetime().nullable(),publishedAt:z.iso.datetime().nullable()});
const headers = {"Cache-Control":"private, no-store",Vary:"Cookie"};
type Dependencies = WorkspaceRequestDependencies & {read:(context:WorkspaceContext,page:WorkspacePostPage)=>Promise<unknown>};

export function createWorkspacePostListHandler(dependencies:Dependencies) {
  return async (request:NextRequest,workspaceId:string) => {
    const access = await authorizeWorkspace(request,workspaceId,dependencies,"posts.read");
    if (access.response) return access.response;
    let page:WorkspacePostPage;
    try { page=parseWorkspacePostPage(request.nextUrl.searchParams); }
    catch { return NextResponse.json({error:"خيارات تحميل المنشورات غير صالحة."},{status:400,headers}); }
    try {
      const rows=z.array(postSchema).max(page.limit+1).parse(await dependencies.read(access.context,page));
      const items=rows.slice(0,page.limit);
      const last=items.at(-1);
      return NextResponse.json({items,nextCursor:rows.length>page.limit && last ? encodeCommentCursor(last.createdAt,last.id) : null},{headers});
    } catch {
      console.error("Workspace posts unavailable",{code:"WORKSPACE_POSTS_UNAVAILABLE"});
      return NextResponse.json({error:"تعذر تحميل منشورات مساحة العمل. حاول لاحقًا."},{status:503,headers});
    }
  };
}
