# Paid Features

Linear features we left out because shipping them costs money (the app must
stay on free tiers). Each entry says what it would cost and what we built for
free instead.

| Feature | Why it costs money | Free alternative in the app |
|---|---|---|
| AI summaries (issue / comment thread / project update) | Needs an LLM API (e.g. Claude API, billed per token) | None yet. Descriptions and activity are readable as-is. |
| AI-quality triage suggestions & duplicate detection | Same LLM cost for semantic matching | Heuristic versions: trigram + full-text similarity (Postgres `pg_trgm`) for duplicates, and label/assignee/priority suggestions from similar past issues |
| Native mobile apps (iOS / Android) | Apple Developer Program $99/yr; Google Play $25 one-time | Installable PWA with offline pages and web push |
| Native desktop app | Code-signing certificates (Apple $99/yr; Windows ~$100–400/yr); unsigned builds trip OS warnings | PWA "Install app" on desktop Chrome/Edge |
| Zapier integration | Zapier's "Webhooks by Zapier" and multi-step zaps need a paid Zapier plan | Outgoing webhooks + REST/GraphQL API (work with n8n self-hosted or Make's free tier) |
| Intercom / Zendesk / Front integrations | Those products are paid (per-seat) — nothing to integrate with on a free plan | Customer requests via the intake form, Slack Asks and the API |
| Email beyond Resend's free tier | Resend free = 3,000 emails/month, 100/day | Digests batch notifications; in-app inbox and web push are unlimited |
| Realtime at scale (websockets) | Vercel Hobby has no websockets; managed realtime (Ably, Pusher, Liveblocks) is paid past small free tiers | Server-sent events + polling fallback, offline outbox, cross-tab sync |

## If you ever want to add one

- **AI summaries**: add `ANTHROPIC_API_KEY`, call the Messages API from a server action with the thread text, cache the result on the issue (e.g. `ticket.summary`, `summary_updated_at`) and regenerate on new comments.
- **Native apps**: wrap the PWA with Capacitor (mobile) or Tauri (desktop); the web push and offline work already carry over.
