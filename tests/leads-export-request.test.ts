import test from 'node:test';
import assert from 'node:assert/strict';
import { requestLeadReport } from '../src/app/leads/analytics/export-request';
test('download request forwards cancellation and only returns an actual CSV with a safe filename', async () => {
  const signal = new AbortController().signal;
  const response = await requestLeadReport('/api/leads/analytics/export?days=7', signal, async (input, init) => {
    assert.equal(input, '/api/leads/analytics/export?days=7'); assert.equal(init?.signal, signal); assert.equal(init?.cache, 'no-store');
    return new Response('من,إلى', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="leads-analytics-2026-10-01-2026-10-07-2026-10-07.csv"' } });
  });
  assert.equal(await response.blob.text(), 'من,إلى'); assert.match(response.filename, /^leads-analytics-[\d-]+\.csv$/);
});
test('error responses and login HTML cannot be saved as reports or leak server error text', async () => {
  for (const status of [400,401,403,500,503]) {
    await assert.rejects(requestLeadReport('/api/leads/analytics/export', new AbortController().signal, async () => new Response('PRIVATE_SERVER_ERROR', { status })), error => error instanceof Error && !error.message.includes('PRIVATE_SERVER_ERROR'));
  }
  await assert.rejects(requestLeadReport('/api/leads/analytics/export', new AbortController().signal, async () => new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } })));
});
test('untrusted filename falls back to a fixed CSV name and aborts remain propagated', async () => {
  const result = await requestLeadReport('/api/leads/analytics/export', new AbortController().signal, async () => new Response('CSV', { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="../../evil.html"' } }));
  assert.equal(result.filename, 'leads-analytics.csv');
  const failure = new DOMException('cancelled', 'AbortError');
  await assert.rejects(requestLeadReport('/api/leads/analytics/export', new AbortController().signal, async () => { throw failure; }), error => error === failure);
});
