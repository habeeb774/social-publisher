import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ReviewActions } from "../src/app/reviews/review-actions";

test("review card presents distinct decisions without opening a reason form initially", () => {
  const router = { bfcacheId: "qa", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, {value:router}, React.createElement(ReviewActions,{id:"qa"})));
  assert.match(html, /aria-busy="false"/);
  for (const label of ["موافقة", "طلب تعديل", "رفض"]) assert.ok(html.includes(label));
  assert.ok(!html.includes("textarea"));
});
