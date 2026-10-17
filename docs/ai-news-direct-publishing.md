# AI news direct-source publishing

AI news settings support `verificationMode: corroborated | approved_source`.
Existing configurations default to corroborated. Elon news is unchanged.

In approved-source mode a report from one currently enabled catalogue source
may become eligible without independent corroboration or a human review. This
is an editorial preference, not a claim of factual verification. The database
retains the internal `verified` enum for eligible stories, but records
`approved_source_direct_v1` as their policy and the UI calls them eligible.

The worker processes pending stories on every direct-mode scheduler tick,
independently of feed polling, with at most two Arabic generation attempts.
Arabic sources work without an LLM. Foreign headlines require the existing
server-side Anthropic provider; missing translation configuration fails closed
and records ARABIC_GENERATION_FAILED. No synthetic translation is substituted.

Source approval, duplicate holds, freshness, Arabic output validation, Meta
permissions and Page identity, durable send reservations, quota, minimum gap,
lease fencing, and uncertain-outcome quarantine remain mandatory. Reverting
to corroborated mode blocks direct-policy stories at the atomic send gate;
they need explicit editorial reapproval to proceed. No migration is required.

Tests: `npx tsx --test tests/ai-news-direct.test.ts tests/ai-news.test.ts`.
