import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { guard } from "@/services/api-guard";
import { currentUser, ROLE_LABELS } from "@/services/rbac";

/** Current user plus small navigation counters (inbox needing reply, failed posts, pending reviews). */
export async function GET(request: NextRequest) {
  const denied = await guard(request, false); if (denied) return denied;
  const user = await currentUser(request);
  const counts = { inbox: 0, failed: 0, reviews: 0 };
  try {
    const r = await getDb().execute(sql`select
      (select count(*)::int from posts where status='failed' and deleted_at is null) as failed,
      (select count(*)::int from posts where status='pending_approval' and deleted_at is null) as reviews,
      coalesce((select count(*)::int from facebook_comments where needs_reply and status not in ('spam','hidden','resolved','replied')), 0) as inbox`);
    Object.assign(counts, r.rows[0]);
  } catch { /* comments tables may be absent in older databases */ }
  return NextResponse.json({ user: user && { name: user.name, email: user.email, role: user.role, roleLabel: ROLE_LABELS[user.role] }, counts });
}
