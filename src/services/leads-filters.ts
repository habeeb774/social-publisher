import { z } from "zod";
import { LEAD_STAGES } from "./leads-stages";

const cursorSchema = z.object({
  time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/).refine(value => Number.isFinite(Date.parse(value))),
  id: z.uuid(),
}).strict();
export function decodeLeadCursor(value?: string) {
  if (!value) return null;
  if (value.length > 300) throw new Error("INVALID_CURSOR");
  return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString()));
}
export function encodeLeadCursor(time: string, id: string) {
  return Buffer.from(JSON.stringify(cursorSchema.parse({ time, id }))).toString("base64url");
}
export function leadSearchPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, character => `\\${character}`)}%`;
}
export function leadListHref(q: string, status: string, cursor?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status && LEAD_STAGES.includes(status as typeof LEAD_STAGES[number])) params.set("status", status);
  if (cursor) params.set("cursor", cursor);
  return `/leads${params.size ? `?${params}` : ""}`;
}
