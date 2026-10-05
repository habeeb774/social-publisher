// Layout primitives shared by every page so headers, sections and metrics look identical everywhere.
import Link from "next/link";
import { Icon } from "./icons";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function Card({ title, action, children, className = "", flush = false }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return <section className={`card ${flush ? "card-flush" : ""} ${className}`}>{(title || action) && <div className="card-header" style={flush ? { padding: "16px 20px 0" } : undefined}>{title && <h2>{title}</h2>}{action}</div>}{children}</section>;
}

export type MetricItem = { label: string; value: React.ReactNode; hint?: React.ReactNode; trend?: { dir: "up" | "down" | "flat"; text: string }; spark?: number[]; href?: string };
export function MetricStrip({ items }: { items: MetricItem[] }) {
  return <div className="metric-strip" role="list">{items.map((m) => {
    const body = <><small>{m.label}</small><strong>{m.value}</strong>{m.trend && <span className={`trend ${m.trend.dir}`}>{m.trend.dir === "up" ? "▲" : m.trend.dir === "down" ? "▼" : "•"} {m.trend.text}</span>}{m.hint && <small>{m.hint}</small>}{m.spark && m.spark.length > 1 && <Sparkline values={m.spark} />}</>;
    return m.href ? <Link key={m.label} href={m.href} className="metric" role="listitem" style={{ textDecoration: "none" }}>{body}</Link> : <div key={m.label} className="metric" role="listitem">{body}</div>;
  })}</div>;
}

export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values), w = 100, h = 28, step = w / Math.max(1, values.length - 1);
  const points = values.map((v, i) => `${(w - i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>;
}

export function HealthRow({ label, state, value }: { label: string; state: "ok" | "warn" | "bad" | "off"; value: string }) {
  return <div className="health-row"><i className={`dot ${state}`} /><span className="label">{label}</span><span className="value">{value}</span></div>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div className="stack" aria-hidden="true"><div className="skeleton skeleton-title" />{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton skeleton-line" style={{ width: `${90 - i * 12}%` }} />)}</div>;
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="btn btn-ghost btn-sm"><Icon name="chevron" width={14} />{label}</Link>;
}
