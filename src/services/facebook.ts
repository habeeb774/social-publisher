export type FacebookPublishInput = { pageId: string; content: string; imageUrl?: string };
export type FacebookResult = { id: string; permalink?: string; dryRun: boolean };

export async function publishToFacebook(input: FacebookPublishInput): Promise<FacebookResult> {
  if (process.env.PUBLISHING_ENABLED !== "true") {
    return { id: `dry-run-${Date.now()}`, dryRun: true };
  }
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_VERSION ?? "v23.0";
  if (!token) throw new Error("Facebook credentials are not configured");
  const endpoint = input.imageUrl ? `${input.pageId}/photos` : `${input.pageId}/feed`;
  const body = new URLSearchParams({ message: input.content, access_token: token });
  if (input.imageUrl) body.set("url", input.imageUrl);
  const response = await fetch(`https://graph.facebook.com/${version}/${endpoint}`, { method: "POST", body, signal: AbortSignal.timeout(15000) });
  const data = await response.json() as { id?: string; post_id?: string; error?: { message?: string; type?: string; code?: number } };
  if (!response.ok || (!data.id && !data.post_id)) throw new Error(data.error?.message ?? "Facebook publication failed");
  const id = data.post_id ?? data.id!;
  return { id, permalink: `https://www.facebook.com/${id}`, dryRun: false };
}

export async function testFacebookConnection() {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_VERSION ?? "v23.0";
  if (!pageId || !token) throw new Error("Facebook credentials are not configured");
  const response = await fetch(`https://graph.facebook.com/${version}/${pageId}?fields=id,name&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(10000) });
  const data = await response.json() as { id?: string; name?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? "Facebook connection failed");
  return data;
}
