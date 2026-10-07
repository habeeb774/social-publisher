import { test } from "node:test";
import assert from "node:assert/strict";
import { sendTestEmail } from "../src/services/alerts";

test("test email errors never expose provider bodies or network exception details", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { key: process.env.RESEND_API_KEY, to: process.env.ALERT_EMAIL, from: process.env.ALERT_FROM };
  process.env.RESEND_API_KEY = "test-only-not-a-real-key";
  process.env.ALERT_EMAIL = "test@example.test";
  delete process.env.ALERT_FROM;
  const secret = "private-provider-detail";
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: secret }), { status: 400 });
    const rejected = await sendTestEmail();
    assert.equal(rejected.ok, false);
    assert.equal(JSON.stringify(rejected).includes(secret), false);
    globalThis.fetch = async () => { throw new Error(secret); };
    const uncertain = await sendTestEmail();
    assert.equal(uncertain.ok, false);
    assert.equal(JSON.stringify(uncertain).includes(secret), false);
    assert.match(uncertain.error ?? "", /قبل إعادة المحاولة/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of [["RESEND_API_KEY", saved.key], ["ALERT_EMAIL", saved.to], ["ALERT_FROM", saved.from]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
  }
});
