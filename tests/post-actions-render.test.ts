import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PostActions, VersionHistory } from "../src/app/posts/[id]/post-panels";

test("version history starts loading without claiming an empty history", () => {
  const router = { bfcacheId: "qa", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router },
    React.createElement(VersionHistory, { id: "qa", editable: false })));
  assert.ok(html.includes("سجل التعديلات"));
  assert.ok(!html.includes("لا توجد نسخ سابقة"));
  assert.ok(!html.includes("استرجاع هذه النسخة"));
});

test("post action rendering separates authors, reviewers and publishers", () => {
  const router = { bfcacheId: "qa", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  const render = (status: string, canWrite: boolean, canReview: boolean, canPublish: boolean) => renderToStaticMarkup(
    React.createElement(AppRouterContext.Provider, { value: router },
      React.createElement(PostActions, { id: "qa", status, approvalRequired: true, canWrite, canReview, canPublish })),
  );
  const editor = render("pending_approval", true, false, false);
  assert.ok(!editor.includes("رفض / طلب تعديل"));
  assert.ok(!editor.includes(">موافقة<"));
  const reviewer = render("pending_approval", false, true, false);
  assert.ok(reviewer.includes("رفض / طلب تعديل"));
  assert.ok(reviewer.includes("موافقة"));
  assert.ok(!reviewer.includes("تكرار"));
  const draftEditor = render("draft", true, false, false);
  assert.ok(draftEditor.includes("إرسال للمراجعة"));
  assert.ok(!draftEditor.includes("نشر الآن"));
  assert.ok(render("approved", false, false, true).includes("نشر الآن"));
  assert.ok(!render("published", true, true, true).includes("نشر الآن"));
  assert.equal(render("pending_approval", false, false, false), '<div class="post-actions"></div>');
});
