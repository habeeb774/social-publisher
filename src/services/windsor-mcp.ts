import { parseMcpResponse, type JsonRpcResponse } from "./mcp-response";

const endpoint = () => process.env.WINDSOR_MCP_URL || "https://mcp.windsor.ai/";

async function rpc(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
  const key = process.env.WINDSOR_API_KEY;
  if (!key) throw new Error("WINDSOR_API_KEY_MISSING");
  const requestId=crypto.randomUUID();
  const notification=method.startsWith("notifications/");
  const response = await fetch(endpoint(), { method: "POST", signal:AbortSignal.timeout(25000), headers: {
    Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  }, body: JSON.stringify(notification
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id: requestId, method, params }) });
  if (response.status === 401 || response.status === 403) throw new Error("WINDSOR_AUTH_FAILED");
  if (!response.ok) throw new Error(`MCP_CONNECTION_FAILED: HTTP ${response.status}`);
  const text=await response.text();
  const payload:JsonRpcResponse=notification?{}:parseMcpResponse(text,requestId);
  return { payload, sessionId: response.headers.get("mcp-session-id") || sessionId };
}

async function callTool(name: string, args: Record<string, unknown>, sessionId?: string) {
  const result = await rpc("tools/call", { name, arguments: args }, sessionId);
  if (result.payload.error) throw new Error(`MCP_TOOL_ERROR: ${result.payload.error.message || "unknown"}`);
  if ((result.payload.result as {isError?: boolean})?.isError) { const text = (result.payload.result as {content?:Array<{text?:string}>}).content?.map(item=>item.text).filter(Boolean).join(" ").slice(0,400); throw new Error(`MCP_TOOL_ERROR: provider rejected ${name}${text ? ` — ${text}` : ""}`); }
  return result;
}

function contentJson(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const object = value as { structuredContent?: unknown; content?: Array<{ text?: string }> };
  if (object.structuredContent) return object.structuredContent;
  const text = object.content?.find((item) => item.text)?.text;
  if (text) { try { return JSON.parse(text); } catch {} }
  return value;
}

export async function testWindsorMcp() {
  const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "social-publisher", version: "1.0.0" } });
  const sessionId = init.sessionId;
  await rpc("notifications/initialized", {}, sessionId);
  const tools = await rpc("tools/list", {}, sessionId);
  const toolNames = ((tools.payload.result as { tools?: Array<{ name?: string }> })?.tools || []).map((tool) => tool.name).filter(Boolean) as string[];
  const connectorsResponse = await callTool("get_connectors", { include_not_yet_connected: false, include_actions: true }, sessionId);
  const rawData = contentJson(connectorsResponse.payload.result);
  const data = rawData && typeof rawData === "object" && "result" in rawData
    ? contentJson((rawData as { result?: unknown }).result)
    : rawData;
  const connectors = Array.isArray(data) ? data : ((data as { connectors?: unknown[] })?.connectors || []);
  const organic = (connectors as Array<Record<string, unknown>>).find((item) => item.connector === "facebook_organic" || item.id === "facebook_organic");
  const actions = Array.isArray(organic?.actions) ? organic.actions : [];
  const actionIds = actions.map((action) => typeof action === "string" ? action : (action as { id?: string })?.id).filter(Boolean);
  const accounts = Array.isArray(organic?.accounts) ? organic.accounts : [];
  const page = accounts.find(account => String((account as {id?:string}).id) === "1330947143441946") || null;
  const ads = (connectors as Array<Record<string, unknown>>).find(item => item.id === "facebook");
  return { toolNames, facebookOrganicConnected: accounts.length > 0, facebookAdsConnected: Array.isArray(ads?.accounts) && ads.accounts.length > 0, page, actions: actionIds };
}

/** Read-only discovery from the same machine-authenticated session the worker uses. */
export async function discoverWindsorPublishing() {
  const init = await rpc("initialize", {protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"social-publisher-worker",version:"1.0.0"}});
  if (init.payload.error) throw new Error("MCP_RUNTIME_CONNECTION_REQUIRED");
  await rpc("notifications/initialized",{},init.sessionId);
  const listing = await rpc("tools/list",{},init.sessionId);
  const executeSchema = (listing.payload.result as {tools?:Array<{name:string;inputSchema:unknown}>})?.tools?.find(tool=>tool.name==="execute_action")?.inputSchema;
  const connectors = await callTool("get_connectors",{include_not_yet_connected:false,include_actions:true},init.sessionId);
  const actions = await callTool("list_actions",{connector:"facebook_organic"},init.sessionId);
  return {connectors:contentJson(connectors.payload.result), actions:contentJson(actions.payload.result), executeSchema, sessionId:init.sessionId};
}

function unwrap(value: unknown): unknown {
  return value && typeof value === "object" && "result" in value ? unwrap((value as {result:unknown}).result) : value;
}

export async function publishWindsorPost(input: {pageId:string;content:string;imageUrl?:string}, dryRun:boolean) {
  const discovered = await discoverWindsorPublishing();
  const connectors = unwrap(discovered.connectors) as Array<{id:string;accounts?:Array<{id:string}>}>;
  const organic = Array.isArray(connectors) ? connectors.find(item=>item.id==="facebook_organic") : undefined;
  if (!organic?.accounts?.some(account=>String(account.id)===input.pageId)) throw new Error("FACEBOOK_ORGANIC_AUTH_REQUIRED");
  const actions = unwrap(discovered.actions) as Array<{id:string}>;
  const action = input.imageUrl ? "create_photo_post" : "create_post";
  if (!Array.isArray(actions) || !actions.some(item=>item.id===action)) throw new Error("MCP_PUBLISH_ACTION_REQUIRED");
  if (dryRun) return {id:"dry-run",dryRun:true,provider:"facebook_mcp" as const};
  try {
    const response = await callTool("execute_action",{connector:"facebook_organic",account:input.pageId,action,params:input.imageUrl?{image_url:input.imageUrl,caption:input.content}:{message:input.content}},discovered.sessionId);
    const data = unwrap(contentJson(response.payload.result)) as {id?:string;post_id?:string;permalink?:string};
    const id = data?.id || data?.post_id;
    if (typeof id!=="string"||!id.trim()) throw new Error(`MCP_POST_ID_MISSING: ${JSON.stringify(response.payload.result).slice(0,400)}`);
    return {id,permalink:data.permalink,dryRun:false,provider:"facebook_mcp" as const};
  } catch(cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    // An explicit provider rejection means nothing was posted; surface it as a definite failure.
    if (detail.startsWith("MCP_TOOL_ERROR")) throw cause;
    // A timeout can happen after Facebook accepted the post. Never retry blindly.
    throw new Error(`MCP_PUBLISH_OUTCOME_UNKNOWN: تحقق من الصفحة قبل أي إعادة محاولة (${detail.slice(0,400)})`,{cause});
  }
}
