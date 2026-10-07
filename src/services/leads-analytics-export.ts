import { leadAnalyticsFilters, leadAnalyticsRange, leadAnalyticsSummary, type LeadAnalyticsRow } from './leads-analytics';
import { csvResponse, toCsv } from './export';

type Range = ReturnType<typeof leadAnalyticsRange>;
type Filters = ReturnType<typeof leadAnalyticsFilters.parse>;
type Dependencies = {
  authorize: () => Promise<Response | null>;
  scope: () => Promise<ReadonlySet<string> | null>;
  query: (range: Range, scope: ReadonlySet<string> | null, filters: Filters) => Promise<LeadAnalyticsRow[]>;
  audit: (metadata: Record<string, unknown>) => Promise<void>;
};
const error = (message: string, status: number) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } });

/** Exports only aggregate creation-cohort metrics; never individual lead data. */
export function createLeadAnalyticsExport(dependencies: Dependencies) {
  return async (url: URL) => {
    const denied = await dependencies.authorize();
    if (denied) return denied;
    let range: Range;
    let filters: Filters;
    try {
      const params = Object.fromEntries(url.searchParams);
      range = leadAnalyticsRange(params);
      filters = leadAnalyticsFilters.parse(params);
    } catch {
      return error('الفترة أو خيارات التصفية غير صالحة. اختر فترة لا تتجاوز سنة.', 400);
    }
    try {
      const scope = await dependencies.scope();
      if (filters.pageId && scope !== null && !scope.has(filters.pageId)) return error('الصفحة غير متاحة ضمن صلاحياتك.', 403);
      const metrics = await dependencies.query(range, scope, filters);
      const summary = leadAnalyticsSummary(metrics);
      const labels: Record<string, string> = { manual: 'يدوي', messenger: 'Messenger', other: 'مصادر أخرى' };
      const rows = [{ source: 'الإجمالي', ...summary }, ...metrics.map(row => ({ ...row, source: labels[row.source] ?? labels.other, conversion: leadAnalyticsSummary([row]).conversion }))]
        .map(row => ({ from: range.from, to: range.to, timezone: 'Asia/Riyadh', platform: filters.platform, pageId: filters.pageId || 'كل الصفحات المسموح بها', source: row.source, total: row.total, won: row.won, lost: row.lost, conversion: row.conversion ?? 'غير متاحة', definition: 'المكتسبون حاليًا ÷ العملاء الذين أُنشئوا في الفترة' }));
      const csv = toCsv(rows, [['from', 'من'], ['to', 'إلى'], ['timezone', 'التوقيت'], ['platform', 'المنصة'], ['pageId', 'الصفحة'], ['source', 'المصدر'], ['total', 'العملاء'], ['won', 'مكتسبون'], ['lost', 'مفقودون'], ['conversion', 'نسبة التحويل (%)'], ['definition', 'تعريف التحويل']]);
      await dependencies.audit({ kind: 'leads-analytics', from: range.from, to: range.to, ...filters });
      return csvResponse(csv, `leads-analytics-${range.from}-${range.to}`);
    } catch {
      console.error('Lead analytics export unavailable', { code: 'LEAD_ANALYTICS_EXPORT_UNAVAILABLE' });
      return error('تعذر تصدير التقرير. حاول مجددًا لاحقًا.', 503);
    }
  };
}
