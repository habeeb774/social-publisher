// Small helpers for per-device UI preferences (theme, density, nav). Kept outside components
// so effects only schedule reads and DOM writes stay in plain functions.
export const readPref = (key: string, fallback: string) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
export const writePref = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
export function setRootData(name: "theme" | "density", value: string | null) {
  const root = document.documentElement;
  if (value === null) delete root.dataset[name]; else root.dataset[name] = value;
}
/** Runs `fn` after the current render commit (avoids synchronous setState inside effects). */
export const afterRender = (fn: () => void) => { const t = setTimeout(fn, 0); return () => clearTimeout(t); };
