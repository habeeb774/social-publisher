import { STATUS_LABELS } from "./api";

const TONE: Record<string, string> = { published: "success", scheduled: "info", publishing: "info", pending_approval: "warning", approved: "warning", failed: "danger", draft: "neutral", cancelled: "neutral", archived: "neutral" };

/** Post status badge (pass `status`) or a generic tone badge (pass `tone` + children). */
export function StatusBadge({ status, tone, children }: { status?: string; tone?: "neutral" | "success" | "warning" | "danger" | "info"; children?: React.ReactNode }) {
  const t = tone ?? (status ? TONE[status] : "neutral") ?? "neutral";
  return <span className={`badge badge-${t}`}>{children ?? (status ? STATUS_LABELS[status] ?? status : null)}</span>;
}
