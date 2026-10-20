import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Cloudflare Workers adapter for the existing Next.js application.
 *
 * External services remain explicit bindings/env values for the first
 * compatibility phase. This keeps the production database and publishing
 * credentials unchanged while the Workers runtime is verified.
 */
export default defineCloudflareConfig();
