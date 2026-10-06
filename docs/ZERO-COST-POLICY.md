# Zero-Cost Policy

Social Publisher must stay at **0 SAR/month whenever usage remains inside free tiers**.

Rules:

1. Prefer free tiers and open-source options first.
2. Never enable a paid plan, usage billing, paid add-on, or payment method automatically.
3. Never add a provider that can create charges without an explicit user decision.
4. If a free quota is exhausted, fail closed with a clear message instead of switching to a paid provider.
5. Any feature that has no practical free implementation must be marked `PAID_BLOCKED`.
6. Secrets stay server-side only and must never be logged or exposed to the browser.

Approved zero-cost stack:
- Vercel Free
- Neon Free
- Vercel Blob free allowance
- Meta Graph API / Meta OAuth
- GitHub Free
- Existing free scheduler
- Cloudflare free allowances when added later

This policy applies to future AI, image generation, analytics, automation, storage, and messaging work.
