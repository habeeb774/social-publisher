/** RFC 4180 CSV with a UTF-8 BOM so Excel opens Arabic text correctly. Formula-like cells are neutralized. */
export function toCsv(rows: Array<Record<string, unknown>>, columns: Array<[key: string, header: string]>) {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV injection guard
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [columns.map(([, h]) => cell(h)).join(","), ...rows.map((r) => columns.map(([k]) => cell(r[k])).join(","))].join("\r\n");
}

export const csvResponse = (csv: string, name: string) => new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
