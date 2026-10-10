const hooks = new Set(["⚙️ ما الذي يتغيّر في أدوات عملك؟", "🔐 تستخدم هذه الأدوات في عملك؟ انتبه لهذا الخبر."]);
export function extractTechNewsCard(content: string) {
  const lines = content.split("\n").map(line => line.trim()).filter(Boolean);
  const title = lines.find(line => !hooks.has(line) && !line.startsWith("📡") && !line.startsWith("خبر تقني") && !line.startsWith("🔗") && !line.startsWith("المصدر:") && !line.startsWith("#")) ?? "أخبار التقنية";
  const source = (lines.find(line => line.startsWith("المصدر:")) ?? "المصدر: تقنية").slice("المصدر:".length).trim();
  return { title: title.length > 180 ? `${title.slice(0,177).trimEnd()}…` : title, source: source.slice(0,80) };
}
export const isArabicCardText = (text: string) => /[\u0621-\u064a]/.test(text);
/** Explicit rows avoid unsupported bidirectional paragraph layout. Keep Latin runs intact. */
export function cardTextRows(text: string, limit = 28): string[][] {
  const units = text.trim().match(/[A-Za-z0-9][A-Za-z0-9 .+:/_-]*(?:[A-Za-z0-9])|\S+/g) ?? [];
  const rows: string[][] = [];
  let row: string[] = [], size = 0;
  for (const unit of units) {
    if (row.length && size + unit.length + 1 > limit) { rows.push(row); row = []; size = 0; }
    row.push(unit); size += unit.length + 1;
  }
  if (row.length) rows.push(row);
  return rows;
}
