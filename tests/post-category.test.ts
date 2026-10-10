import test from "node:test";
import assert from "node:assert/strict";
import { postInputSchema } from "../src/services/posts";
import { POST_CATEGORIES } from "../src/services/catalog";

test("optional and empty categories are accepted, valid labels are trimmed", () => {
  const base = { pageId: "qa", content: "اختبار" };
  assert.equal(postInputSchema.parse(base).category, undefined);
  for (const category of [null, "", "   "]) assert.equal(postInputSchema.parse({ ...base, category }).category, null);
  for (const category of POST_CATEGORIES) assert.equal(postInputSchema.parse({ ...base, category: ` ${category} ` }).category, category);
  const result = postInputSchema.safeParse({ ...base, category: "unsupported" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues[0].message, "اختر تصنيفًا من القائمة أو اختر بدون تصنيف");
});
