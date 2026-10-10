import test from "node:test";
import assert from "node:assert/strict";
import { extractTechNewsCard, cardTextRows } from "../src/services/tech-news-card-text";
test("uses the source headline, not current or legacy hooks", () => {
  for (const hook of ["⚙️ ما الذي يتغيّر في أدوات عملك؟", "🔐 تستخدم هذه الأدوات في عملك؟ انتبه لهذا الخبر.", "📡 آخر أخبار التكنولوجيا"]) {
    assert.equal(extractTechNewsCard(`${hook}\n\nAI coding agents generate more code, but not more software\n\n🔗 التفاصيل من المصدر: https://example.test\nالمصدر: Ars Technica\n#تقنية`).title, "AI coding agents generate more code, but not more software");
  }
});
test("Arabic word rows retain logical order and keep Latin product names together", () => {
  const rows = cardTextRows("مايكروسوفت تطلق Microsoft 365 لتحسين أدوات العمل",28);
  assert.ok(rows.flat().includes("Microsoft 365"));
  assert.equal(rows.flat()[0],"مايكروسوفت");
  assert.equal(rows.flat().at(-1),"العمل");
});
