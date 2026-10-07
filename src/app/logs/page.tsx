import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLabel } from "@/services/audit-labels";
import { AppShell } from "../ui/app-shell";
import { EmptyState } from "../ui/empty-state";
import { PageHeader } from "../ui/kit";
import { pageSession } from "@/services/session-server";
import { can } from "@/services/rbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "السجلات" };
const FILTERS = { all: "الكل", publishing: "النشر", facebook: "Facebook", scheduler: "الجدولة", comments: "التعليقات", system: "النظام", errors: "الأخطاء" } as const;
type Filter = keyof typeof FILTERS;
type Log = { at: string; level: "info" | "ok" | "warn" | "error"; source: string; event: string; entity: string | null; entity_type: string | null; message: string; details: unknown };
const LIMIT = 150;
const soon = () => new Date(Date.now() + 60000);

/**
 * Developer-console view merging audit events, publication attempts, scheduler runs and comment syncs.
 * Each source is capped and filtered in SQL; pagination is by time ("before").
 */
export default async function Logs({ searchParams }: { searchParams: Promise<{ type?: string; before?: string; q?: string }> }) {
  const session=await pageSession();
  if(!session||!can(session.role,"audit.read"))return <AppShell title="السجلات"><div className="alert alert-info">ليست لديك صلاحية لعرض سجلات النظام.</div></AppShell>;
  const params = await searchParams;
  const type: Filter = params.type && params.type in FILTERS ? params.type as Filter : "all";
  const before = params.before && !Number.isNaN(Date.parse(params.before)) ? new Date(params.before) : soon();
  const q = (params.q ?? "").trim().slice(0, 80);
  const like = `%${q.replace(/[%_\\]/g, "")}%`;
  const want = (s: Filter) => type === "all" || type === s || type === "errors";
  const db = getDb();
  const parts = await Promise.all([
    want("publishing") || want("facebook") ? db.execute(sql`select started_at as at, case when status in ('failed','outcome_unknown') then 'error' when status in ('success','DRY_RUN_SUCCESS') then 'ok' else 'info' end as level, 'publishing' as source, concat('publish.', status) as event, post_id::text as entity, 'post' as entity_type, coalesce(error_message, concat('المحاولة ', attempt_number, ' · ', provider)) as message, json_build_object('provider', provider, 'facebook_post_id', facebook_post_id, 'finished_at', finished_at) as details from publication_attempts where started_at < ${before.toISOString()}::timestamptz ${q ? sql`and (error_message ilike ${like} or post_id::text like ${like})` : sql``} order by started_at desc limit ${LIMIT}`) : null,
    want("scheduler") ? db.execute(sql`select triggered_at as at, case when status = 'success' then 'info' else 'error' end as level, 'scheduler' as source, concat('scheduler.', status) as event, null as entity, null as entity_type, coalesce(error_message, concat('عولج ', processed_count, ' · نُشر ', published_count, ' · فشل ', failed_count, ' · ', coalesce(duration_ms, 0), 'ms')) as message, null as details from scheduler_runs where triggered_at < ${before.toISOString()}::timestamptz ${type === "errors" ? sql`and status <> 'success'` : sql``} order by triggered_at desc limit ${type === "scheduler" ? LIMIT : 30}`) : null,
    want("comments") ? db.execute(sql`select started_at as at, case when status in ('success','completed') then 'info' else 'warn' end as level, 'comments' as source, concat('comments.sync.', status) as event, null as entity, null as entity_type, coalesce(error_code, concat('استيراد ', imported)) as message, null as details from comments_sync_runs where started_at < ${before.toISOString()}::timestamptz order by started_at desc limit ${LIMIT}`).catch(() => null) : null,
    want("system") ? db.execute(sql`select created_at as at, case when action like '%fail%' then 'error' else 'info' end as level, 'system' as source, action as event, entity_id::text as entity, entity_type, coalesce(metadata->>'actor', 'النظام') as message, metadata as details from activity_logs where created_at < ${before.toISOString()}::timestamptz ${q ? sql`and (action ilike ${like} or metadata::text ilike ${like})` : sql``} order by created_at desc limit ${LIMIT}`) : null,
  ]);
  let logs = parts.flatMap((p) => (p?.rows ?? []) as Log[]).map((l) => ({ ...l, at: String(l.at) }));
  if (type === "errors") logs = logs.filter((l) => l.level === "error" || l.level === "warn");
  if (type === "facebook") logs = logs.filter((l) => l.source === "publishing");
  logs = logs.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, LIMIT);
  const oldest = logs.at(-1)?.at;
  const href = (extra: Record<string, string>) => `/logs?${new URLSearchParams(Object.entries({ type, q, ...extra }).filter(([k, v]) => v && !(k === "type" && v === "all")))}`;
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));

  return <AppShell title="السجلات">
    <PageHeader title="السجلات" description="سجل موحد للنشر والجدولة والتعليقات وعمليات النظام. الأوقات بتوقيت الرياض." actions={<a className="btn btn-secondary" href="/api/export/activity">تصدير CSV</a>} />
    <nav className="tabs">{(Object.keys(FILTERS) as Filter[]).map((f) => <Link key={f} href={href({ type: f, before: "" })} className={type === f ? "active" : ""}>{FILTERS[f]}</Link>)}</nav>
    <form className="toolbar" method="get">{type !== "all" && <input type="hidden" name="type" value={type} />}<input name="q" type="search" defaultValue={q} placeholder="ابحث في الأحداث أو رقم المنشور…" aria-label="بحث في السجلات" /><button className="btn btn-secondary">بحث</button></form>
    <section className="card card-flush log-console">
      {!logs.length ? <EmptyState icon="logs" title="لا توجد سجلات مطابقة" /> : logs.map((l, i) => <div key={i} className="log-row">
        <time>{fmt(l.at)}</time>
        <span className={`lvl ${l.level}`}>{l.level.toUpperCase()}</span>
        <span className="event">{l.event}{l.source === "system" && <small style={{ display: "block", fontFamily: "var(--font)" }}>{auditLabel(l.event)}</small>}</span>
        <details><summary><span className="clamp-2">{l.message}</span>{l.entity && l.entity_type === "post" && <> · <Link href={`/posts/${l.entity}`}>المنشور</Link></>}</summary>{l.details ? <pre>{JSON.stringify(l.details, null, 2)}</pre> : null}</details>
      </div>)}
    </section>
    {logs.length === LIMIT && oldest && <nav className="pagination"><Link className="btn btn-secondary btn-sm" href={href({ before: oldest })}>أقدم</Link></nav>}
  </AppShell>;
}
