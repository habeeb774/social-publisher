"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { POST_CATEGORIES } from "@/services/catalog";
import { api } from "../ui/api";

type Goal = { id: string; category: string | null; target: number; published: number; scheduled: number; percent: number };
export function GoalsClient({ month, goals }: { month: string; goals: Goal[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [target, setTarget] = useState(20);
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault(); setError("");
    try { await api("/api/goals", { method: "POST", body: { month, category: category || null, target } }); router.refresh(); } catch (err) { setError(err instanceof Error ? err.message : "تعذر الحفظ"); }
  }
  async function remove(id: string) { await api(`/api/goals?id=${id}`, { method: "DELETE" }); router.refresh(); }
  return <div className="form-layout">
    <section>{!goals.length ? <div className="card empty-state"><strong>لا توجد أهداف لهذا الشهر</strong><small>مثلًا: 20 منشورًا، منها 10 منتجات و5 أخبار.</small></div> :
      <div className="card-grid">{goals.map((g) => <article key={g.id} className="card"><header className="row-between"><strong>{g.category ?? "كل المنشورات"}</strong><button className="link-button" onClick={() => remove(g.id)}>حذف</button></header>
        <p><b>{g.published}</b> من {g.target} منشور فعليًا{g.scheduled ? ` · ${g.scheduled} مجدول` : ""}</p>
        <div className="progress" role="progressbar" aria-valuenow={g.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${g.percent}%` }} /></div><small>{g.percent}%</small></article>)}</div>}
    </section>
    <form className="post-form panel-card" onSubmit={save}><h2>هدف جديد</h2>
      <label>التصنيف<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">كل المنشورات</option>{POST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label>العدد المستهدف<input type="number" min={1} max={1000} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></label>
      {error && <p role="alert">{error}</p>}<button className="btn btn-primary">حفظ الهدف</button><small>الهدف لنفس التصنيف يُستبدل.</small>
    </form>
  </div>;
}
