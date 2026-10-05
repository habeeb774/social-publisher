import { z } from "zod";
import { POST_CATEGORIES } from "./catalog";
export const postInputSchema = z.object({
  pageId: z.string().min(1),
  content: z.string().trim().min(1).max(63206),
  scheduledAt: z.coerce.date().optional(),
  timezone: z.literal("Asia/Riyadh").default("Asia/Riyadh"),
  status: z.enum(["draft","scheduled"]).default("draft"),
  category: z.enum(POST_CATEGORIES).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  campaignId: z.uuid().nullable().optional(),
  imageUrl: z.url().refine((url)=>/^https:\/\//i.test(url),"رابط الصورة يجب أن يبدأ بـ https://").nullable().optional(),
}).superRefine((post,ctx)=>{
  if(post.status === "scheduled" && (!post.scheduledAt || post.scheduledAt.getTime() <= Date.now())) ctx.addIssue({code:"custom",path:["scheduledAt"],message:"حدد موعد نشر في المستقبل"});
});
export function classifyFacebookError(message: string) { const permanent = /token|permission|page id|oauth/i.test(message); return { retryable: !permanent, message }; }
