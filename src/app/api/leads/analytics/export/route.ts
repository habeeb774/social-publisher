import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { guard } from '@/services/api-guard';
import { currentUser } from '@/services/rbac';
import { allowedPageIds } from '@/services/access-scope';
import { logAudit } from '@/services/audit';
import { leadAnalyticsQuery, type LeadAnalyticsRow } from '@/services/leads-analytics';
import { createLeadAnalyticsExport } from '@/services/leads-analytics-export';

export async function GET(request: NextRequest) {
  return createLeadAnalyticsExport({
    authorize: () => guard(request, false, 'data.export'),
    scope: async () => {
      const user = await currentUser(request);
      if (!user) throw new Error('USER_UNAVAILABLE');
      return allowedPageIds(user);
    },
    query: async (range, scope, filters) => (await getDb().execute(leadAnalyticsQuery(range, scope, filters))).rows as LeadAnalyticsRow[],
    audit: metadata => logAudit('export.downloaded', 'export', null, metadata),
  })(request.nextUrl);
}
