import { isPublishingEnabled } from "@/services/publishing-mode";
import { publishWindsorPost, testWindsorMcp } from "./windsor-mcp";
import { isGraphConfigured, publishGraphPost, publishInstagramGraph } from "./facebook-graph";
export type FacebookPublishInput = { pageId: string; content: string; imageUrl?: string; platform?: string };
export type FacebookResult = { id: string; permalink?: string; dryRun: boolean; provider: "facebook_mcp" | "facebook_graph" };
export type FacebookCapabilities = { connected: boolean; readAccount: boolean; listPages: boolean; readPosts: boolean; publishText: boolean; publishImage: boolean };
export type FacebookRuntimeStatus = "connected" | "blocked" | "not_configured";

/** Facebook provider boundary. Graph API (facebook-graph.ts) is used when META_PAGE_ACCESS_TOKEN is set. */
export interface FacebookProvider { getCapabilities(): Promise<FacebookCapabilities>; publish(input: FacebookPublishInput): Promise<FacebookResult>; }

export class FacebookMcpProvider implements FacebookProvider {
  async getCapabilities(): Promise<FacebookCapabilities> {
    try {
      const result = await testWindsorMcp();
      return { connected: result.facebookOrganicConnected, readAccount: result.toolNames.includes("get_connectors"), listPages: Boolean(result.page), readPosts: result.toolNames.includes("query"), publishText: result.actions.includes("create_post"), publishImage: result.actions.includes("create_photo_post") };
    } catch {
      return { connected: false, readAccount: false, listPages: false, readPosts: false, publishText: false, publishImage: false };
    }
  }
  async publish(input: FacebookPublishInput): Promise<FacebookResult> { return publishWindsorPost(input,!isPublishingEnabled()); }
}

export const facebookProvider = new FacebookMcpProvider();
export async function publishToFacebook(input: FacebookPublishInput): Promise<FacebookResult> {
  // A page access token takes precedence: Windsor's Facebook connection lacks pages_manage_posts.
  if (input.platform === "instagram") {
    if (!isGraphConfigured()) throw new Error("INSTAGRAM_AUTH_REQUIRED: يتطلب رمز Meta");
    return publishInstagramGraph({ igUserId: input.pageId, content: input.content, imageUrl: input.imageUrl }, !isPublishingEnabled());
  }
  if (input.platform && input.platform !== "facebook") throw new Error(`PLATFORM_UNSUPPORTED: ${input.platform}`);
  if (isGraphConfigured()) return publishGraphPost(input, !isPublishingEnabled());
  return facebookProvider.publish(input);
}
export async function testFacebookConnection() { return facebookProvider.getCapabilities(); }

export function getFacebookRuntimeStatus(): FacebookRuntimeStatus {
  if (isGraphConfigured()) return "connected";
  if (!process.env.WINDSOR_MCP_URL) return "not_configured";
  if (!process.env.WINDSOR_API_KEY) return "blocked";
  return "connected";
}
