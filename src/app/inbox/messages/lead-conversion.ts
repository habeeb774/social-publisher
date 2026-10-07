import { z } from "zod";
import { inboxJson } from "../inbox-request";

const resultSchema = z.object({ id: z.uuid() });
export async function convertMessengerLead(conversationId: string): Promise<string> {
  const result = await inboxJson<unknown>("/api/leads/from-messenger", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId }),
  });
  const parsed = resultSchema.safeParse(result);
  if (!parsed.success) throw new Error("لم يتأكد التحويل. راجع قائمة العملاء المحتملين قبل المحاولة مجددًا.");
  return parsed.data.id;
}
