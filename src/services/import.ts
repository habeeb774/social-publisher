import * as XLSX from "xlsx";

export const IMPORT_FIELDS = {
  content: { label: "نص المنشور", required: true, synonyms: ["نص المنشور", "النص", "المحتوى", "content", "text", "post", "caption", "message"] },
  date: { label: "تاريخ النشر", required: false, synonyms: ["تاريخ النشر", "التاريخ", "date", "publish date", "scheduled date", "day"] },
  time: { label: "وقت النشر", required: false, synonyms: ["وقت النشر", "الوقت", "الساعة", "time", "publish time", "hour"] },
  imageUrl: { label: "رابط الصورة", required: false, synonyms: ["رابط الصورة", "الصورة", "image", "image url", "photo", "media"] },
  category: { label: "التصنيف", required: false, synonyms: ["التصنيف", "category", "type", "النوع"] },
  tags: { label: "الوسوم", required: false, synonyms: ["الوسوم", "tags", "hashtags", "وسوم"] },
  ready: { label: "جاهز للنشر", required: false, synonyms: ["جاهز للنشر", "جاهز", "ready", "approved", "status"] },
} as const;
export type ImportField = keyof typeof IMPORT_FIELDS;
export type ImportMapping = Partial<Record<ImportField, string>>;
export const MAX_IMPORT_ROWS = 500;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const pad = (n: number) => String(n).padStart(2, "0");

/** Parses XLSX/XLS/CSV into header names and string rows. Excel date cells become YYYY-MM-DD / HH:MM. */
export function parseSheet(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const name = workbook.SheetNames.find((n) => n.toLowerCase() === "posts") ?? workbook.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name] ?? {}, { defval: "", raw: true });
  const headers = Array.from(new Set(raw.flatMap((r) => Object.keys(r)))).filter((h) => !h.startsWith("__EMPTY"));
  const rows = raw.slice(0, MAX_IMPORT_ROWS).map((r) => Object.fromEntries(headers.map((h) => {
    const v = r[h];
    if (v instanceof Date) {
      // A date-only cell has no time part; keep the time column separate.
      const hasTime = v.getUTCHours() + v.getUTCMinutes() > 0 && v.getUTCFullYear() < 1901;
      return [h, hasTime ? `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}` : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`];
    }
    return [h, String(v ?? "").trim()];
  })));
  return { sheet: name, headers, rows, truncated: raw.length > MAX_IMPORT_ROWS, total: raw.length };
}

/** Suggests a header for each field by name (exact synonym first, then contains). The user can change it. */
export function suggestMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  const used = new Set<string>();
  for (const [field, meta] of Object.entries(IMPORT_FIELDS) as Array<[ImportField, typeof IMPORT_FIELDS[ImportField]]>) {
    const syn = meta.synonyms.map(norm);
    const hit = headers.find((h) => !used.has(h) && syn.includes(norm(h))) ?? headers.find((h) => !used.has(h) && syn.some((s) => norm(h).includes(s)));
    if (hit) { mapping[field] = hit; used.add(hit); }
  }
  return mapping;
}

/** Accepts YYYY-MM-DD, D/M/YYYY or D-M-YYYY (day first, as used in Saudi Arabia). Returns null if invalid. */
export function parseDate(value: string) {
  const v = value.trim();
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3].length === 2 ? `20${match[3]}` : match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
export function parseTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(ص|م|am|pm))?$/i);
  if (!match) return null;
  let h = Number(match[1]); const min = Number(match[2]); const suffix = match[3]?.toLowerCase();
  if (suffix === "م" || suffix === "pm") h = h % 12 + 12; else if (suffix === "ص" || suffix === "am") h = h % 12;
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

export type MappedRow = { index: number; content: string; scheduledAt: Date | null; imageUrl: string | null; category: string | null; tags: string[]; ready: boolean; errors: string[]; warnings: string[] };

/** Applies the mapping and validates each row. Nothing is written here. */
export function mapRows(rows: Array<Record<string, string>>, mapping: ImportMapping, defaultTime: string): MappedRow[] {
  const seen = new Set<string>();
  const get = (row: Record<string, string>, f: ImportField) => mapping[f] ? (row[mapping[f]!] ?? "").trim() : "";
  return rows.map((row, index) => {
    const errors: string[] = [], warnings: string[] = [];
    const content = get(row, "content");
    if (!content) errors.push("النص فارغ");
    const rawDate = get(row, "date");
    const date = rawDate ? parseDate(rawDate) : null;
    if (rawDate && !date) errors.push(`تاريخ غير مفهوم: ${rawDate}`);
    const rawTime = get(row, "time");
    const time = rawTime ? parseTime(rawTime) : defaultTime;
    if (rawTime && !time) errors.push(`وقت غير مفهوم: ${rawTime}`);
    const scheduledAt = date && time ? new Date(`${date}T${time}:00+03:00`) : null;
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) warnings.push("الموعد في الماضي؛ سيُحفظ كمسودة");
    let imageUrl = get(row, "imageUrl") || null;
    const drive = imageUrl?.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (drive) imageUrl = `https://drive.google.com/uc?export=download&id=${drive[1]}`;
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) { errors.push("رابط الصورة يجب أن يبدأ بـ https://"); imageUrl = null; }
    const ready = mapping.ready ? /^(نعم|yes|y|true|1|جاهز|ready)$/i.test(get(row, "ready")) : true;
    if (!ready) warnings.push("غير جاهز؛ سيُحفظ كمسودة");
    const key = `${content}|${date}|${time}`;
    if (content && seen.has(key)) errors.push("صف مكرر"); seen.add(key);
    return { index: index + 1, content, scheduledAt, imageUrl, category: get(row, "category") || null, tags: get(row, "tags").split(/[\s,،#]+/).filter(Boolean), ready, errors, warnings };
  });
}

// Kept for the legacy preview endpoint.
export type ImportReport = { total: number; valid: number; missingDate: number; missingContent: number; invalidImage: number; duplicate: number };
export function previewWorkbook(buffer: ArrayBuffer): ImportReport {
  const { headers, rows } = parseSheet(buffer);
  const mapped = mapRows(rows, suggestMapping(headers), "20:00");
  return { total: mapped.length, valid: mapped.filter((r) => !r.errors.length).length, missingDate: mapped.filter((r) => !r.scheduledAt).length, missingContent: mapped.filter((r) => !r.content).length, invalidImage: mapped.filter((r) => r.errors.some((e) => e.includes("الصورة"))).length, duplicate: mapped.filter((r) => r.errors.includes("صف مكرر")).length };
}
