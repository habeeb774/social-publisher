export type FacebookPublishInput = { pageId: string; content: string; imageUrl?: string };
export type FacebookResult = { id: string; permalink?: string; dryRun: boolean; provider: "facebook_mcp" };
export type FacebookCapabilities = { connected: boolean; readAccount: boolean; listPages: boolean; readPosts: boolean; publishText: boolean; publishImage: boolean };

/** Facebook provider boundary. Direct Graph API calls are intentionally not used. */
export interface FacebookProvider { getCapabilities(): Promise<FacebookCapabilities>; publish(input: FacebookPublishInput): Promise<FacebookResult>; }

export class FacebookMcpProvider implements FacebookProvider {
  async getCapabilities(): Promise<FacebookCapabilities> {
    return { connected: false, readAccount: false, listPages: false, readPosts: false, publishText: false, publishImage: false };
  }
  async publish(_input: FacebookPublishInput): Promise<FacebookResult> { throw new Error("BLOCKED_CAPABILITY: Facebook MCP publishing tools are not connected"); }
}

export const facebookProvider = new FacebookMcpProvider();
export async function publishToFacebook(input: FacebookPublishInput): Promise<FacebookResult> {
  if (process.env.PUBLISHING_ENABLED !== "true") return { id: `dry-run-${Date.now()}`, dryRun: true, provider: "facebook_mcp" };
  return facebookProvider.publish(input);
}
export async function testFacebookConnection() { return facebookProvider.getCapabilities(); }
