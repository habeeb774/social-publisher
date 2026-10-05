"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "./api";

type Filter = { id: string; name: string; query: string };
/** Named shortcuts for the current filter combination (posts list or calendar). */
export function SavedFilters({ scope, query, basePath }: { scope: "posts" | "calendar"; query: string; basePath: string }) {
  const [items, setItems] = useState<Filter[]>([]);
  useEffect(() => { api<Filter[]>(`/api/saved-filters?scope=${scope}`).then(setItems).catch(() => undefined); }, [scope]);
  async function save() {
    const name = prompt("اسم الفلتر (مثلًا: منشورات حبيب المجدولة)")?.trim();
    if (!name) return;
    const row = await api<Filter>("/api/saved-filters", { method: "POST", body: { name, scope, query } });
    setItems([row, ...items]);
  }
  async function remove(id: string) { await api(`/api/saved-filters?id=${id}`, { method: "DELETE" }); setItems(items.filter((i) => i.id !== id)); }
  if (!items.length && !query) return null;
  return <div className="chips saved-filters" aria-label="الفلاتر المحفوظة">
    {items.map((f) => <span key={f.id} className="chip"><Link href={`${basePath}?${f.query}`}>{f.name}</Link><button className="chip-remove" aria-label={`حذف ${f.name}`} onClick={() => remove(f.id)}>×</button></span>)}
    {query && <button className="chip muted" onClick={save}>＋ حفظ الفلتر الحالي</button>}
  </div>;
}
