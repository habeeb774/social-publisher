# أخبار الذكاء الاصطناعي

Administrator-only `/ai-news` and `/api/ai-news`, with independent `ai_news_config`, `ai_news_runtime`, four `ai_news_*` tables, and tracked additive migration `0026_ai_news.sql`. Existing Elon news settings and records are not migrated or overwritten. Both features share the audited Meta permission boundary and the responsive RTL dashboard and Arabic activity components, but not their configuration, data, quota or lease.

## Evidence and accuracy

Directly operated HTTPS RSS sources were checked on 2026-10-17:

- OpenAI: https://openai.com/news/rss.xml
- Google AI: https://blog.google/innovation-and-ai/technology/ai/rss/
- Hugging Face: https://huggingface.co/blog/feed.xml
- NVIDIA: https://blogs.nvidia.com/blog/category/deep-learning/feed/

Do not silently substitute unofficial mirrors when a source becomes unavailable. Fixed URLs, canonical article-host allowlists, blocked redirects, 12-second timeouts, a 1 MiB body limit and XML entity/DOCTYPE rejection prevent arbitrary fetching. Only AI-related headlines with a valid source publication date in the last 48 hours (at most 5 minutes in the future) enter discovery. Evidence retains original title, bounded excerpt, canonical URL, source identity, hash, retrieval time and publication time. This is RSS-based monitoring, not a claim to have fetched or read the complete linked article.

A vendor announcement supports that vendor's announcement, not independent proof of performance, safety, price, or superiority. A single source **does not qualify for automatic verification**. Rumours and possible duplicates remain pending. The deliberately conservative two-approved-group, identical-normalized-headline policy is retained; most announcements require human review. Neither this heuristic nor Arabic/numeric validation guarantees factual or translation accuracy. Administrators must check the linked evidence and attribute claims before approval. Generated posts explicitly attribute the statement to the listed sources; an AI writing provider cannot approve evidence or authorize publishing.

## Safe operation

Monitoring and publishing default off; rollout may enable monitoring for the user-selected Page while leaving public publishing off. The existing authenticated scheduler calls the AI runner alongside Elon news; no new Vercel cron, paid service or minute-level scheduling assumption is introduced. Polling has a 10-minute minimum and is subject to the existing scheduler and hosting limits. The dashboard exposes independent polling, daily quota and minimum-gap controls in Asia/Riyadh.

The existing durable publication marker, unique story fingerprint and canonical URLs, one publication per story, lease fencing, permission/policy revision checks, bounded retries and quarantine of unknown outcomes are reproduced for AI news. They protect this pipeline from duplicate retries/restarts; they are not a universal cross-section semantic deduplication system and cannot prevent an independently published paraphrase in another feature. Unknown sends are never blindly retried. No production publication is needed for QA.

## QA

`npx tsx --test tests/ai-news.test.ts tests/elon-news.test.ts tests/elon-news-activity.test.ts` covers AI relevance/source approval, canonicalization, safe Arabic validation, permissions, Graph outcome classification, persistent leases, quotas, concurrency and the shared Arabic activity UI.

`scripts/test-ai-news-branch.ts` hard-refuses non-QA database hosts, applies the tracked migration in the expiring branch, and tests real API authentication, origin checks, pagination, review and full synthetic discovery-to-publication with dependency-injected feeds/Meta. It leaves monitoring/publishing off and sends no live posts. Never copy its fixtures, account or mock ID into production. Local environment files are unchanged; credentials are injected only into test processes.

The branch used for QA is `br-polished-boat-b1i0zfx6`, expiring 2026-10-18 06:00 UTC. A separate real-feed discovery check fetched all four sources without source failures and stored three recent OpenAI reports, with public publishing disabled. No claim is made that every official source publishes daily.
