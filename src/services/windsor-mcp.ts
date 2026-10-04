type JsonRpcResponse = { result?: unknown; error?: { code?: number; message?: string }; };

const endpoint = () => process.env.WINDSOR_MCP_URL || "https://mcp.windsor.ai/";

function parseResponse(text: string): JsonRpcResponse {
  try { return JSON.parse(text) as JsonRpcResponse; } catch {}
  const events = text.split(/\r?\n\r?\n/).filter(Boolean);
  for (const event of events.reverse()) {
    const data = event.split(/\r?\n/).find((line) => line.startsWith("data:"));
    if (data) { try { return JSON.parse(data.slice(5).trim()) as JsonRpcResponse; } catch {} }
  }
  throw new Error("MCP_CONNECTION_FAILED: invalid MCP response");
}

async function rpc(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
  const key = process.env.WINDSOR_API_KEY;
  if (!key) throw new Error("WINDSOR_API_KEY_MISSING");
  const response = await fetch(endpoint(), { method: "POST", headers: {
    Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  }, body: JSON.stringify(method.startsWith("notifications/")
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id: Date.now(), method, params }) });
  if (response.status === 401 || response.status === 403) throw new Error("WINDSOR_AUTH_FAILED");
  if (!response.ok) throw new Error(`MCP_CONNECTION_FAILED: HTTP ${response.status}`);
  return { payload: parseResponse(await response.text()), sessionId: response.headers.get("mcp-session-id") || sessionId };
}

async function callTool(name: string, args: Record<string, unknown>, sessionId?: string) {
  const result = await rpc("tools/call", { name, arguments: args }, sessionId);
  if (result.payload.error) throw new Error(`MCP_TOOL_ERROR: ${result.payload.error.message || "unknown"}`);
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
  if (!sessionId) throw new Error("MCP_CONNECTION_FAILED: missing session id");
  await rpc("notifications/initialized", {}, sessionId);
  const tools = await rpc("tools/list", {}, sessionId);
  const toolNames = ((tools.payload.result as { tools?: Array<{ name?: string }> })?.tools || []).map((tool) => tool.name).filter(Boolean) as string[];
  const connectorsResponse = await callTool("get_connectors", { include_not_yet_connected: true, include_actions: true }, sessionId);
  const data = contentJson(connectorsResponse.payload.result);
  const connectors = Array.isArray(data) ? data : ((data as { connectors?: unknown[] })?.connectors || []);
  const organic = (connectors as Array<Record<string, unknown>>).find((item) => item.connector === "facebook_organic" || item.id === "facebook_organic");
  const actions = Array.isArray(organic?.actions) ? organic.actions : [];
  const actionIds = actions.map((action) => typeof action === "string" ? action : (action as { id?: string })?.id).filter(Boolean);
  return { toolNames, facebookOrganicConnected: Boolean(organic), page: organic?.accounts || organic?.account || null, actions: actionIds };
}
