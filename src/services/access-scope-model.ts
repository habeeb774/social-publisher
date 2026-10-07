import { z } from "zod";
const scopeSchema=z.object({
  unrestricted:z.boolean(),
  accountIds:z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  pageIds:z.array(z.uuid()).max(500).default([]),
});
/** Invalid persisted authorization data must never become unrestricted access. */
export function parseUserAccessScope(raw:unknown){
  const result=scopeSchema.safeParse(raw);
  if(!result.success)throw new Error("ACCESS_SCOPE_INVALID");
  return {...result.data,accountIds:Array.from(new Set(result.data.accountIds)),pageIds:Array.from(new Set(result.data.pageIds))};
}
