import { sql } from "drizzle-orm";

/** null means unrestricted; an empty set must deny every row, including unassigned leads. */
export function leadPageScope(allowed: ReadonlySet<string> | null, column: "page_id" | "l.page_id" = "page_id") {
  if (allowed === null) return sql`true`;
  if (!allowed.size) return sql`false`;
  return sql`${sql.raw(column)} in (${sql.join(Array.from(allowed, (id) => sql`${id}::uuid`), sql`, `)})`;
}
