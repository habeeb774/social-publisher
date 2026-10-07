import { encodeLeadCursor } from "./leads-filters";
export function nextFollowupScanCursor(rows:ReadonlyArray<Record<string,unknown>>,batchSize=50) {
  const last=rows.at(-1);
  return rows.length===batchSize&&last?encodeLeadCursor(String(last.cursor_time),String(last.id)):null;
}
