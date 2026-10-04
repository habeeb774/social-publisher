import * as XLSX from "xlsx";

export type ImportRow = { number?: string; date?: string; content?: string; imageUrl?: string; ready?: string };
export type ImportReport = { total: number; valid: number; missingDate: number; missingContent: number; invalidImage: number; duplicate: number; rows: ImportRow[] };

const value = (row: Record<string, unknown>, names: string[]) => { const key = Object.keys(row).find((candidate) => names.includes(candidate.trim().toLowerCase())); return key ? row[key] : undefined; };
export function previewWorkbook(buffer: ArrayBuffer): ImportReport {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames.find((name) => name.toLowerCase() === "posts") ?? workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet ?? {}, { defval: "" });
  const rows: ImportRow[] = raw.map((row) => ({ number: String(value(row, ["رقم المنشور", "post number", "number"]) ?? "").trim(), date: String(value(row, ["تاريخ النشر", "publish date", "date"]) ?? "").trim(), content: String(value(row, ["نص المنشور", "content", "text"]) ?? "").trim(), imageUrl: String(value(row, ["رابط الصورة", "image url", "image"]) ?? "").trim(), ready: String(value(row, ["جاهز للنشر", "ready", "status"]) ?? "").trim() }));
  const seen = new Set<string>(); let missingDate=0, missingContent=0, invalidImage=0, duplicate=0;
  for (const row of rows) { if (!row.date) missingDate++; if (!row.content) missingContent++; if (row.imageUrl && !/^https:\/\//i.test(row.imageUrl)) invalidImage++; const key=`${row.number}|${row.date}|${row.content}`; if(seen.has(key)) duplicate++; seen.add(key); }
  return { total: rows.length, valid: rows.length-missingDate-missingContent-invalidImage-duplicate, missingDate, missingContent, invalidImage, duplicate, rows };
}
