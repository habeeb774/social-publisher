"use client";
import { useState } from "react";
import { Icon } from "./icons";

/** On phones, secondary filters collapse behind one button; on larger screens they are always visible. */
export function FilterToggle({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="btn btn-secondary mobile-only filter-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Icon name="queue" width={15} />فلاتر{active > 0 && <span className="badge badge-info">{active}</span>}</button>
    <div className={`filter-extra ${open ? "open" : ""}`}>{children}</div>
  </>;
}
