import assert from "node:assert/strict";
import test from "node:test";
import { decryptToken, encryptToken } from "../src/services/page-tokens";

test("page tokens round-trip encrypted and reject tampering", () => {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-page-tokens";
  const stored = encryptToken("EAAB-page-token-value");
  assert.ok(!stored.includes("EAAB"));
  assert.equal(decryptToken(stored), "EAAB-page-token-value");
  const parts = stored.split(".");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decryptToken(parts.join(".")));
});

test("weekly report is due only on Sunday 09:00 Riyadh", async () => {
  const { weeklyReportDue } = await import("../src/services/weekly-report");
  assert.equal(weeklyReportDue(new Date("2026-10-11T06:05:00Z")), true); // Sunday 09:05 Riyadh
  assert.equal(weeklyReportDue(new Date("2026-10-11T07:05:00Z")), false);
  assert.equal(weeklyReportDue(new Date("2026-10-12T06:05:00Z")), false);
});
