"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

export type MenuItem = { label: string; icon?: string; onSelect: () => void; danger?: boolean; disabled?: boolean } | "separator";

/** Accessible "⋯" dropdown for row actions. Closes on outside click / Escape. */
export function RowMenu({ items, label = "إجراءات" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey); window.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", onScroll, true); };
  }, [open]);
  const visible = items.filter((i, idx) => i !== "separator" || (idx > 0 && items[idx - 1] !== "separator"));
  return <div className="row-menu" ref={ref}>
    <button type="button" className="btn btn-ghost btn-sm btn-icon-sm" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const below = window.innerHeight - r.bottom > 280; setPos({ top: below ? r.bottom + 4 : Math.max(8, r.top - 284), left: Math.max(8, r.left) }); setOpen((v) => !v); }}><Icon name="more" width={16} /></button>
    {open && <div className="menu" role="menu" style={pos ? { position: "fixed", top: pos.top, left: pos.left, right: "auto" } : undefined}>{visible.map((item, i) => item === "separator" ? <div key={`s${i}`} className="menu-sep" /> : <button key={item.label} type="button" role="menuitem" className={item.danger ? "danger" : ""} disabled={item.disabled} onClick={() => { setOpen(false); item.onSelect(); }}>{item.icon && <Icon name={item.icon} width={15} />}{item.label}</button>)}</div>}
  </div>;
}
