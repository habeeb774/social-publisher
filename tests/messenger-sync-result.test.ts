import { test } from "node:test";
import assert from "node:assert/strict";
import { messengerSyncNotice, safeMessengerSyncPages } from "../src/services/messenger-sync-result";

test("Messenger synchronization distinguishes full, partial, failed and no-page results", () => {
  assert.equal(messengerSyncNotice({ imported: 0, status: { page: null } }).type, "success");
  assert.equal(messengerSyncNotice({ imported: 2, status: { page: null, other: "failure" } }).type, "warning");
  assert.equal(messengerSyncNotice({ imported: 2, status: { page: "failure" } }).type, "error");
  assert.equal(messengerSyncNotice({ imported: 0, status: {} }).type, "info");
});

test("unknown results never imply a successful synchronization", () => {
  for (const value of [null, {}, { imported: -1, status: {} }, { imported: 1.2, status: {} }, { imported: 0, status: { page: undefined } }]) {
    assert.equal(messengerSyncNotice(value).type, "error");
  }
});

test("public synchronization status preserves page outcomes without raw provider errors", () => {
  const raw = "private provider detail and token";
  const result = safeMessengerSyncPages({ success: null, failed: raw, blank: "" });
  assert.equal(result.success, null);
  assert.equal(result.failed, "تعذرت مزامنة الصفحة. راجع الاتصال والصلاحيات.");
  assert.equal(result.blank, result.failed);
  assert.equal(JSON.stringify(result).includes(raw), false);
  assert.equal(messengerSyncNotice({ imported: 0, status: result }).message.includes(raw), false);
});
