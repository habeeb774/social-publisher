import { publishWindsorPost, testWindsorMcp } from "./windsor-mcp";
export type FacebookPublishInput = { pageId: string; content: string; imageUrl?: string };
export type FacebookResult = { id: string; permalink?: string; dryRun: boolean; provider: "facebook_mcp" };
export type FacebookCapabilities = { connected: boolean; readAccount: boolean; listPages: boolean; readPosts: boolean; publishText: boolean; publishImage: boolean };
export type FacebookRuntimeStatus = "connected" | "blocked" | "not_configured";

/** Facebook provider boundary. Direct Graph API calls are intentionally not used. */
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
  async publish(input: FacebookPublishInput): Promise<FacebookResult> { return publishWindsorPost(input,process.env.PUBLISHING_ENABLED !== "true"); }
}

export const facebookProvider = new FacebookMcpProvider();
export async function publishToFacebook(input: FacebookPublishInput): Promise<FacebookResult> {
  return facebookProvider.publish(input);
}
export async function testFacebookConnection() { return facebookProvider.getCapabilities(); }

export function getFacebookRuntimeStatus(): FacebookRuntimeStatus {
  if (!process.env.WINDSOR_MCP_URL) return "not_configured";
  if (!process.env.WINDSOR_API_KEY) return "blocked";
  return "connected";
}
