import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/services/request-auth";
import { discoverWindsorPublishing, testWindsorMcp } from "../../../../../services/windsor-mcp";

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.WINDSOR_API_KEY) return NextResponse.json({ provider: "windsor", status: "WINDSOR_API_KEY_MISSING", safeMode: process.env.PUBLISHING_ENABLED !== "true" }, { status: 503 });
  try {
    const result = await testWindsorMcp();
    const discovery = await discoverWindsorPublishing();
    const publishText = result.actions.includes("create_post");
    const publishPhoto = result.actions.includes("create_photo_post");
    return NextResponse.json({ provider: "windsor", mcpConnected: true, facebookOrganicConnected: result.facebookOrganicConnected, pageAvailable: Boolean(result.page), capabilities: { read: true, publishText, publishPhoto }, safeMode: process.env.PUBLISHING_ENABLED !== "true", actions: result.actions, page: result.page, discovery });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP_CONNECTION_FAILED";
    console.error("Facebook MCP connectivity test failed", { error: message.split("\n")[0] });
    const status = message === "WINDSOR_AUTH_FAILED" ? 401 : 502;
    return NextResponse.json({ provider: "windsor", status: message.split(":")[0], safeMode: process.env.PUBLISHING_ENABLED !== "true" }, { status });
  }
}
