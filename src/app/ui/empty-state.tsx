export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="ui-empty-state"><span aria-hidden="true">⌁</span><strong>{title}</strong><small>{description}</small>{action}</div>;
}
