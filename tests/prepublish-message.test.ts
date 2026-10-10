import test from "node:test";
import assert from "node:assert/strict";
import { prepublishBlockingMessage } from "../src/services/prepublish-message";

test("scheduling errors show exact blockers and exclude nonblocking warnings", () => {
  const message = prepublishBlockingMessage([
    { label: "الوقت صالح", detail: "الموعد في الماضي", ok: false, critical: true },
    { label: "الصورة متاحة", detail: "الرابط يرجع 500", ok: false, critical: true },
    { label: "عامل النشر يعمل", ok: false, critical: false },
    { label: "الصفحة متصلة", ok: true, critical: true },
  ]);
  assert.match(message, /الموعد في الماضي/);
  assert.match(message, /الرابط يرجع 500/);
  assert.doesNotMatch(message, /عامل النشر|الصفحة متصلة/);
});
