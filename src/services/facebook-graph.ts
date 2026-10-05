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
