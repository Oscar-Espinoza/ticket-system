# Project State: Ticket System

**As of 2026-11-12.** Replaces the June 2026 phase-3 snapshot. Read this first; the rest of `.planning/` is history
(see "Stale planning files" below).

## What it is

A Linear-style issue tracker for a small team that works mostly through AI agents. SvelteKit 3 + Svelte 5, Drizzle on
Postgres (Neon on Vercel, or plain Postgres self-hosted via Docker), Better Auth. Default deployment budget is $0
(Vercel + Neon free tiers); `docs/SELF_HOSTING.md` covers the Docker path.

## What is built (all on `main`)

- **Phases 1–3 of the June plan** (auth, projects + authorization, invite links) and the original core (tickets,
  kanban board, GitHub branch creation, PR webhooks) — then far beyond it:
  - 2026-09-21..24: MIMO Linear-style UI refactor (M1–M8).
  - 2026-09-24..25: Linear Parity I and II (`.planning/features/`): workflow states, labels, priorities, estimates,
    sub-issues and relations, list/board/table/calendar/timeline views, cycles, epics, initiatives, roadmap, triage,
    SLAs, recurring issues, customers and requests, dashboards and insights, collaborative editor with offline sync,
    GitLab/Bitbucket/Sentry automation, Slack, REST + GraphQL APIs, outgoing webhooks, OAuth apps, SAML/OIDC SSO, SCIM,
    two-factor, audit log.
- **Security and reliability review** (`docs/reports/2026-09-25-architecture-security-review.md`): nine findings
  (seven P1, two P2), all fixed on `main` on 2026-11-02 and re-checked by two cross-vendor reviews; migration
  `0009_reliability_fixes`. Open follow-ups (not blocking) are listed at the end of that report: other event
  producers (relations, attachments, epics, members, workflow states, SLA jobs) still write their activity row after
  their own commit.
- **Self-hosting** (2026-11-02..04): Docker image + compose, plain-Postgres driver (`pg`), app migrates and runs daily
  jobs on start (`SELF_HOSTED=true`).
- **SvelteKit migration** (2026-11-04..05): Next.js 16 / React 19 replaced by SvelteKit 3 / Svelte 5; cut over in
  `e185ca9`. Conventions: `docs/migration/PLAN.md`. Parity and perf numbers: `docs/migration/`.
- **Untangle refactor** (2026-11-06): shared owners for workflow-state, SLA, issue-key and search rules, one action
  result contract, provider-neutral VCS engine; merged at `bcb256e`. Report and decision log: `docs/untangle/`.
- **MCP server plan** (2026-11-05): `docs/mcp/PLAN.md`.

## In flight (open PRs on `Oscar-Espinoza/ticket-system`)

| PR | Branch | What |
|---|---|---|
| #1 | `feat/google-sign-in` | Optional Google sign-in |
| #2 | `fix/event-followups` | Review follow-ups: webhook payloads scoped to the event's project; every event committed with its mutation |
| #3 | `feat/follow-up-fields` | Waiting-on and follow-up issue fields + daily follow-up notification |
| #4 | `feat/mcp-server` | MCP server phase 1: `/mcp` with OAuth (DCR, JWT), read tools and three audited writes |
| #5 | `chore/stabilise` | This PR: CI workflow, smoke test of the main flows with fixes, this file |

CI (`.github/workflows/ci.yml`) only starts on a branch once it contains that file: #1–#4 get it after this PR
merges and they are rebased.

## What is next

1. Merge the five PRs above (CI green on each after rebase).
2. **Pilot at Go Nimbly with ~6 developers**, using the app as their task tracker. GitHub and Slack are not verified
   end to end yet: that needs a GitHub OAuth app and a Slack app created by Oscar (setup lists are in the stabilise PR
   body and in Settings → Slack).
3. Decisions left to Oscar: **licence**, **repo owner/org**, **hosting** (Vercel + Neon vs. self-hosted Docker),
   **DNS / public URL** (it is baked into the browser bundle as `PUBLIC_APP_URL` and is the origin the server trusts).

## Stale planning files (not rewritten; read with care)

- `ROADMAP.md`, `REQUIREMENTS.md`, `v1.0-MILESTONE-AUDIT.md`: the June nine-phase v1 plan and its mid-flight audit
  (2026-06-02). Phases 1, 3, 4, 7 and 8 show as unchecked / "gaps found" although their features exist in the app;
  Phase 9 (deploy) is really the open hosting decision below. The audit's gap (MEM-02, invite redirect for
  logged-out users) was never re-verified in that audit's terms.
- `PROJECT.md`: "Out of scope" lists labels, priority, comments and real-time sync, which are all built; it also
  assumes Next.js and the Neon-only free-tier stack.
- `research/`, `phases/`: Next.js-era research and phase 1–3 plans.
- `config.json` and the `current_phase` bookkeeping were GSD tooling state; Oscar overrode GSD workflow for this work.
