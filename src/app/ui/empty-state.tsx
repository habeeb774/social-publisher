import { Icon } from "./icons";

export function EmptyState({ title, description, action, icon = "posts" }: { title: string; description?: string; action?: React.ReactNode; icon?: string }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} width={20} /></span><strong>{title}</strong>{description && <small>{description}</small>}{action}</div>;
}
