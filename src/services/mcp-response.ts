export type JsonRpcResponse = { jsonrpc?:string; id?: string|number|null; result?:unknown; error?:{code?:number;message?:string} };

/** Select this request's response; progress notifications are not tool results. */
export function parseMcpResponse(text:string,requestId:string|number):JsonRpcResponse {
  const candidates:unknown[]=[];
  try { candidates.push(JSON.parse(text)); } catch {
    for(const event of text.split(/\r?\n\r?\n/)) {
      const data=event.split(/\r?\n/).filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");
      if(!data)continue;
      try { candidates.push(JSON.parse(data)); } catch { /* unrelated incomplete SSE event */ }
    }
  }
  for(const candidate of candidates) {
    if(candidate&&typeof candidate==="object"&&"id" in candidate&&candidate.id===requestId&&("result" in candidate||"error" in candidate))return candidate as JsonRpcResponse;
  }
  throw new Error("MCP_CONNECTION_FAILED: matching response missing");
}
