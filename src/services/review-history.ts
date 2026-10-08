import { auditLabel } from "./audit-labels";

export const REVIEW_ACTIONS = ["post.submitted", "post.approved", "post.rejected", "post.changes_requested"];
type AuditRow = { id: string; action: string; createdAt: Date; metadata: unknown };
/** Project only documented review fields, never arbitrary audit metadata. */
export function reviewHistory(rows: readonly AuditRow[]) {
  return rows.filter(row => REVIEW_ACTIONS.includes(row.action) && Number.isFinite(row.createdAt.getTime()))
    .map(row => {
      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
      const actor = typeof metadata.actor === "string" && metadata.actor.trim() ? metadata.actor.trim().slice(0, 254) : null;
      const reason = ["post.rejected", "post.changes_requested"].includes(row.action) && typeof metadata.reason === "string" ? metadata.reason.trim().slice(0, 1000) || null : null;
      return { id: row.id, action: row.action, label: auditLabel(row.action), at: row.createdAt, actor, reason };
    }).sort((a,b)=>b.at.getTime()-a.at.getTime() || b.id.localeCompare(a.id));
}
