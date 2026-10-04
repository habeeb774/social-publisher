import { z } from "zod";
export const postInputSchema = z.object({ pageId: z.string().min(1), content: z.string().trim().min(1).max(63206), scheduledAt: z.coerce.date().optional(), timezone: z.string().default("Asia/Riyadh"), status: z.enum(["draft","scheduled"]).default("draft") });
export function classifyFacebookError(message: string) { const permanent = /token|permission|page id|oauth/i.test(message); return { retryable: !permanent, message }; }
