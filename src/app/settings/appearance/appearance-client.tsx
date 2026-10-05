"use client";
import { useEffect, useState } from "react";
import { afterRender, readPref as read, setRootData, writePref as write } from "../../ui/client-prefs";

export function AppearanceClient() {
  const [theme, setTheme] = useState("system");
  const [density, setDensity] = useState("comfortable");
  useEffect(() => afterRender(() => { setTheme(read("sp-theme", "system")); setDensity(read("sp-density", "comfortable")); }), []);
  const applyTheme = (t: string) => { setTheme(t); write("sp-theme", t); setRootData("theme", t); };
  const applyDensity = (d: string) => { setDensity(d); write("sp-density", d); setRootData("density", d === "compact" ? "compact" : null); };
  return <section className="card"><div className="list">
    <div className="setting-row"><div><strong>الثيم</strong><small>«حسب النظام» يتبع إعداد جهازك تلقائيًا.</small></div><div className="segmented" role="radiogroup" aria-label="الثيم">{[["light", "فاتح"], ["dark", "داكن"], ["system", "حسب النظام"]].map(([k, l]) => <button key={k} role="radio" aria-checked={theme === k} className={theme === k ? "active" : ""} onClick={() => applyTheme(k)}>{l}</button>)}</div></div>
    <div className="setting-row"><div><strong>كثافة العرض</strong><small>«مضغوط» يعرض محتوى أكثر في الشاشة.</small></div><div className="segmented" role="radiogroup" aria-label="الكثافة">{[["comfortable", "مريح"], ["compact", "مضغوط"]].map(([k, l]) => <button key={k} role="radio" aria-checked={density === k} className={density === k ? "active" : ""} onClick={() => applyDensity(k)}>{l}</button>)}</div></div>
    <div className="setting-row"><div><strong>الشريط الجانبي</strong><small>اضغط على عنوان أي مجموعة في الشريط الجانبي لطيّها؛ يتذكر النظام اختيارك.</small></div><span className="badge badge-neutral">مجموعات قابلة للطي</span></div>
  </div></section>;
}
