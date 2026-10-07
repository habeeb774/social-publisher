import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeadAnalyticsExport } from '../src/services/leads-analytics-export';

const page = '8a79eb88-d269-44de-bee6-243ca0391432';
const url = (query = '') => new URL(`https://example.test/api/leads/analytics/export?from=2026-10-01&to=2026-10-07&${query}`);
function fixture() {
  const calls: string[] = [];
  const dependencies = {
    authorize: async (): Promise<Response | null> => null,
    scope: async (): Promise<ReadonlySet<string> | null> => { calls.push('scope'); return new Set([page]); },
    query: async (...args: Parameters<Parameters<typeof createLeadAnalyticsExport>[0]['query']>) => {
      calls.push('query');
      assert.equal(args[0].start, '2026-09-30T21:00:00.000Z');
      assert.equal(args[0].end, '2026-10-07T21:00:00.000Z');
      assert.equal(args[1]?.has(page), true);
      return [{ source: 'manual', total: 3, won: 1, lost: 1, contact: 'PRIVATE_CONTACT', notes: 'PRIVATE_NOTES' }];
    },
    audit: async (metadata: Record<string, unknown>) => { calls.push('audit'); assert.equal(metadata.kind, 'leads-analytics'); },
  };
  return { calls, dependencies };
}
test('CSV report uses Arabic aggregate rows, Riyadh range, selected filters and no private fields', async () => {
  const { calls, dependencies } = fixture();
  const original = dependencies.query;
  dependencies.query = async (...args) => { assert.deepEqual(args[2], { platform: 'facebook', pageId: page }); return original(...args); };
  const response = await createLeadAnalyticsExport(dependencies)(url(`platform=facebook&pageId=${page}`));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /text\/csv/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-disposition')!, /attachment; filename="leads-analytics-2026-10-01-2026-10-07-/);
  const body = await response.text();
  assert.match(body, /الإجمالي,3,1,1,33.3/);
  assert.match(body, /يدوي,3,1,1,33.3/);
  assert.match(body, /Asia\/Riyadh/);
  assert.doesNotMatch(body, /PRIVATE_|contact|notes/);
  assert.deepEqual(calls, ['scope', 'query', 'audit']);
});
test('unauthorized export does not read scope, query data or write audit', async () => {
  for (const status of [401, 403]) {
    const { calls, dependencies } = fixture();
    dependencies.authorize = async () => Response.json({ error: 'ممنوع' }, { status });
    assert.equal((await createLeadAnalyticsExport(dependencies)(url())).status, status);
    assert.deepEqual(calls, []);
  }
});
test('invalid date or platform filters fail before database access', async () => {
  for (const query of ['platform=tiktok', 'pageId=invalid', 'from=2026-02-30', 'from=2026-10-08', 'from=2020-01-01']) {
    const { calls, dependencies } = fixture();
    assert.equal((await createLeadAnalyticsExport(dependencies)(url(query))).status, 400);
    assert.deepEqual(calls, []);
  }
});
test('outside page is rejected before querying aggregates or writing audit', async () => {
  const { calls, dependencies } = fixture();
  assert.equal((await createLeadAnalyticsExport(dependencies)(url('pageId=a4b9cf87-1285-4569-9e7b-8e88cb27d43f'))).status, 403);
  assert.deepEqual(calls, ['scope']);
});
test('empty cohort exports zero counts but unavailable conversion', async () => {
  const { dependencies } = fixture();
  dependencies.query = async () => [];
  const response = await createLeadAnalyticsExport(dependencies)(url());
  assert.match(await response.text(), /الإجمالي,0,0,0,غير متاحة/);
});
test('database failure returns safe retryable error without database secrets', async () => {
  const { calls, dependencies } = fixture();
  dependencies.query = async () => { calls.push('query'); throw new Error('PRIVATE_DATABASE_PASSWORD'); };
  const response = await createLeadAnalyticsExport(dependencies)(url());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /PRIVATE_DATABASE_PASSWORD/);
  assert.deepEqual(calls, ['scope', 'query']);
});
