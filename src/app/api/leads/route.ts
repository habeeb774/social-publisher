import { getDb } from "@/db";
import { guard } from "@/services/api-guard";
import { currentUser } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { logAudit } from "@/services/audit";
import { leadCreateQuery, leadCreateRetryQuery } from "@/services/leads-create";
import { createLeadPostHandler } from "@/services/leads-create-handler";

export const POST = createLeadPostHandler({
  authorize: request => guard(request,true,"leads.create"),
  user: currentUser,
  scope: allowedPageIds,
  insert: async (input,scope) => (await getDb().execute(leadCreateQuery(input,scope))).rows.length > 0,
  retry: async (input,scope) => (await getDb().execute(leadCreateRetryQuery(input,scope))).rows.length > 0,
  audit: id => logAudit("lead.created","lead",id,{ source: "manual" }),
});
