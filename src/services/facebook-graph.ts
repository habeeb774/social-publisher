// Direct Meta Graph API publishing with a token supplied through META_PAGE_ACCESS_TOKEN.
// Graph error bodies mean Facebook rejected the write (nothing was posted); network failures
// and missing IDs are reported as uncertain so the publisher never retries them blindly.

const version = () => process.env.META_GRAPH_VERSION || "v23.0";
const base = () => `https://graph.facebook.com/${version()}`;

type GraphError = { error?: { message?: string; code?: number; type?: string } };

export function isGraphConfigured() {
  return Boolean(process.env.META_PAGE_ACCESS_TOKEN?.trim());
}

async function graph(path: string, init?: RequestInit) {
  const response = await fetch(`${base()}${path}`, { ...init, signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => ({})) as GraphError & Record<string, unknown>;
  return { ok: response.ok && !body.error, body };
}

const graphError = (body: GraphError) => `FACEBOOK_GRAPH_ERROR: (#${body.error?.code ?? "?"}) ${body.error?.message ?? "unknown error"}`;

/** Accepts a page token directly, or a user token that can manage the page. */
async function pageToken(pageId: string) {
  const token = process.env.META_PAGE_ACCESS_TOKEN!.trim();
  const lookup = await graph(`/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`);
  return lookup.ok && typeof lookup.body.access_token === "string" ? lookup.body.access_token : token;
}

export async function checkGraphAccess(pageId: string) {
  const token = await pageToken(pageId);
  const page = await graph(`/${pageId}?fields=id,name&access_token=${encodeURIComponent(token)}`);
  if (!page.ok) throw new Error(graphError(page.body));
  return { id: String(page.body.id), name: String(page.body.name) };
}

export async function publishGraphPost(input: { pageId: string; content: string; imageUrl?: string }, dryRun: boolean) {
  const token = await pageToken(input.pageId);
  if (dryRun) {
    await checkGraphAccess(input.pageId);
    return { id: "dry-run", dryRun: true, provider: "facebook_graph" as const };
  }
  const params = new URLSearchParams({ access_token: token });
  if (input.imageUrl) { params.set("url", input.imageUrl); params.set("caption", input.content); } else params.set("message", input.content);
  let result: Awaited<ReturnType<typeof graph>>;
  try {
    result = await graph(`/${input.pageId}/${input.imageUrl ? "photos" : "feed"}`, { method: "POST", body: params });
  } catch (cause) {
    throw new Error(`MCP_PUBLISH_OUTCOME_UNKNOWN: تحقق من الصفحة قبل أي إعادة محاولة (${cause instanceof Error ? cause.message : "network error"})`, { cause });
  }
  if (result.body.error) throw new Error(graphError(result.body));
  const id = (result.body.post_id || result.body.id) as string | undefined;
  if (!id) throw new Error(`MCP_PUBLISH_OUTCOME_UNKNOWN: تحقق من الصفحة قبل أي إعادة محاولة (${JSON.stringify(result.body).slice(0, 300)})`);
  const link = await graph(`/${id}?fields=permalink_url&access_token=${encodeURIComponent(token)}`).catch(() => null);
  const permalink = link?.ok && typeof link.body.permalink_url === "string" ? link.body.permalink_url : undefined;
  return { id, permalink, dryRun: false, provider: "facebook_graph" as const };
}

/** Replies to a comment as the page. Needs pages_manage_engagement on the token. */
export async function replyToCommentGraph(pageId: string, commentId: string, message: string) {
  const token = await pageToken(pageId);
  let result: Awaited<ReturnType<typeof graph>>;
  try {
    result = await graph(`/${encodeURIComponent(commentId)}/comments`, { method: "POST", body: new URLSearchParams({ message, access_token: token }) });
  } catch {
    throw new Error("COMMENTS_REPLY_OUTCOME_UNKNOWN");
  }
  if (result.body.error) throw new Error(graphError(result.body));
  if (typeof result.body.id !== "string") throw new Error("COMMENTS_REPLY_OUTCOME_UNKNOWN");
  return { id: result.body.id };
}

/** Reports token validity and expiry (expiresAt null = never expires). */
export async function inspectGraphToken() {
  const token = process.env.META_PAGE_ACCESS_TOKEN!.trim();
  const result = await graph(`/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
  const data = (result.body.data ?? {}) as { is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; error?: { message?: string } };
  if (!result.ok) return { valid: false, expiresAt: null, reason: graphError(result.body) };
  const expiry = data.expires_at ? new Date(data.expires_at * 1000) : null;
  return { valid: Boolean(data.is_valid), expiresAt: expiry, reason: data.error?.message ?? null };
}

export type GraphComment = { id: string; postId: string; parentId: string | null; message: string; createdTime: string; hidden: boolean; authorId: string | null; authorName: string | null; permalink: string | null };

/** Comments (and replies) on the page's recent posts. Needs pages_read_engagement. */
export async function listPageCommentsGraph(pageId: string, since: Date, until: Date) {
  const token = await pageToken(pageId);
  const fields = "id,created_time,comments.limit(100){id,message,created_time,from,is_hidden,permalink_url,comments.limit(100){id,message,created_time,from,is_hidden,permalink_url}}";
  const out: GraphComment[] = [];
  let path: string | null = `/${pageId}/feed?fields=${encodeURIComponent(fields)}&limit=25&access_token=${encodeURIComponent(token)}`;
  // Posts older than the window can still get new comments; scan a bounded number of recent posts.
  for (let page = 0; path && page < 4; page++) {
    const result = await graph(path);
    if (!result.ok) throw new Error(graphError(result.body));
    type Raw = { id: string; message?: string; created_time: string; from?: { id: string; name?: string }; is_hidden?: boolean; permalink_url?: string; comments?: { data: Raw[] } };
    for (const post of (result.body.data ?? []) as Array<{ id: string; comments?: { data: Raw[] } }>) {
      const add = (c: Raw, parentId: string | null) => {
        const t = new Date(c.created_time);
        if (t < since || t > until) return;
        out.push({ id: c.id, postId: post.id, parentId, message: c.message ?? "", createdTime: c.created_time, hidden: Boolean(c.is_hidden), authorId: c.from?.id ?? null, authorName: c.from?.name ?? null, permalink: c.permalink_url ?? null });
      };
      for (const c of post.comments?.data ?? []) { add(c, null); for (const r of c.comments?.data ?? []) add(r, c.id); }
    }
    const next = (result.body.paging as { next?: string } | undefined)?.next;
    path = next ? next.replace(base(), "") : null;
  }
  return out;
}

/** Instagram professional account linked to a Facebook page (needs instagram_basic). */
export async function linkedInstagramAccount(pageId: string) {
  const token = await pageToken(pageId);
  const result = await graph(`/${pageId}?fields=instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(token)}`);
  if (!result.ok) throw new Error(graphError(result.body));
  const ig = result.body.instagram_business_account as { id: string; username?: string } | undefined;
  return ig ? { id: ig.id, username: ig.username ?? ig.id } : null;
}

/**
 * Publishes one image with a caption to Instagram (needs instagram_content_publish).
 * Instagram has no text-only posts. Container creation is safe to fail; once media_publish
 * is called, network errors are reported as uncertain and never retried blindly.
 */
export async function publishInstagramGraph(input: { igUserId: string; content: string; imageUrl?: string }, dryRun: boolean) {
  if (!input.imageUrl) throw new Error("INSTAGRAM_IMAGE_REQUIRED: انستجرام لا يقبل منشورًا بدون صورة");
  if (input.content.length > 2200) throw new Error("INSTAGRAM_CAPTION_TOO_LONG: الحد 2200 حرف");
  const token = process.env.META_PAGE_ACCESS_TOKEN!.trim();
  if (dryRun) {
    const check = await graph(`/${input.igUserId}?fields=id,username&access_token=${encodeURIComponent(token)}`);
    if (!check.ok) throw new Error(graphError(check.body));
    return { id: "dry-run", dryRun: true, provider: "facebook_graph" as const };
  }
  const container = await graph(`/${input.igUserId}/media`, { method: "POST", body: new URLSearchParams({ image_url: input.imageUrl, caption: input.content, access_token: token }) });
  if (!container.ok || typeof container.body.id !== "string") throw new Error(graphError(container.body));
  // Instagram fetches the image asynchronously; wait until the container is ready.
  for (let i = 0; i < 10; i++) {
    const status = await graph(`/${container.body.id}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const code = status.body.status_code;
    if (code === "FINISHED") break;
    if (code === "ERROR" || code === "EXPIRED") throw new Error(`INSTAGRAM_MEDIA_FAILED: تعذر تجهيز الصورة (${String(code)})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  let published: Awaited<ReturnType<typeof graph>>;
  try {
    published = await graph(`/${input.igUserId}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: container.body.id, access_token: token }) });
  } catch (cause) {
    throw new Error("MCP_PUBLISH_OUTCOME_UNKNOWN: تحقق من حساب انستجرام قبل أي إعادة محاولة", { cause });
  }
  if (published.body.error) throw new Error(graphError(published.body));
  const id = published.body.id as string | undefined;
  if (!id) throw new Error("MCP_PUBLISH_OUTCOME_UNKNOWN: تحقق من حساب انستجرام قبل أي إعادة محاولة");
  const link = await graph(`/${id}?fields=permalink&access_token=${encodeURIComponent(token)}`).catch(() => null);
  const permalink = link?.ok && typeof link.body.permalink === "string" ? link.body.permalink : undefined;
  return { id, permalink, dryRun: false, provider: "facebook_graph" as const };
}
