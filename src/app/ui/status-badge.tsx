export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  return <span className={`ui-status ui-status-${tone}`}><i aria-hidden="true" />{children}</span>;
}
