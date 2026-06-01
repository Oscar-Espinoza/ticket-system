# Linear-Clone Ticket System

## What This Is

A zero-cost, full-stack Linear-style ticket management system for small teams. Users create an account, start a project, and invite collaborators by shareable link. Tickets move through a drag-and-drop kanban board, and projects connect to GitHub so tickets can spawn branches and auto-update status when pull requests are opened and merged.

## Core Value

A ticket's status stays in sync with real GitHub work — create a branch from a ticket and merging its PR automatically marks the ticket done — without paying for any hosted service.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] User can create an account with email/password or sign in with GitHub
- [ ] User can create a project with a name and a ticket key (e.g. "APP")
- [ ] User can invite collaborators to a project via a shareable invite link
- [ ] Invited user can accept an invite and join as a project member
- [ ] Project has two roles: owner (manage members/project) and member (manage tickets)
- [ ] User can create, edit, and delete tickets within a project
- [ ] Tickets get a per-project identifier (e.g. "APP-42") from an auto-incrementing counter
- [ ] User can assign a ticket to a project member
- [ ] User can view tickets on a kanban board and drag cards between status columns
- [ ] User can connect their GitHub account to enable repo features
- [ ] User can create a GitHub branch from a ticket (using their own GitHub token)
- [ ] A ticket auto-moves to "in review" when a PR is opened on its branch
- [ ] A ticket auto-moves to "done" when its PR is merged (via webhook)
- [ ] App deploys to a public URL on Vercel free tier

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Real-time/live board sync — deferred to v2; optimistic updates + revalidation are enough for v1 and keep it free-tier
- Email-delivered invitations — using copy/paste invite links instead; avoids needing an email provider
- Three-tier roles / fine-grained permissions — owner+member is enough for small teams; revisit if needed
- Labels, priority, due dates, comments, sub-tasks — v2 ticket features, not core to the GitHub-sync value
- Shared org-wide PAT for branch creation — replaced by per-user OAuth tokens for correct multi-tenant attribution

## Context

- Greenfield project. Repo currently contains only a README.
- Original spec document (`~/Downloads/Linear Clone — Ticket System with GitHub Integration.md`) described a single-owner tool; scope was expanded during questioning to a multi-tenant team product.
- Designed entirely around free tiers: Neon Postgres (512 MB), Vercel Hobby, GitHub OAuth + Webhooks + REST API.
- Key technical wrinkle: email/password login means a user may have no GitHub token, so GitHub-dependent features (branch creation, webhooks) are gated behind a separate "Connect GitHub" flow.
- Webhook handlers must read the raw request body before JSON parsing for HMAC-SHA256 signature verification (common Next.js App Router pitfall).

## Constraints

- **Tech stack**: Next.js 15 App Router + TypeScript — one repo for frontend + API routes, no separate backend.
- **Database**: Neon Postgres + Drizzle ORM (`neon-http` driver) — serverless-friendly, free tier.
- **Auth**: Auth.js v5 (NextAuth) with Drizzle adapter — Credentials (email/password via bcryptjs) + GitHub provider, JWT sessions.
- **Styling**: Tailwind CSS + shadcn/ui components + lucide-react icons.
- **Board**: @dnd-kit for drag-and-drop.
- **Budget**: $0 — must stay within free tiers of Neon, Vercel, and GitHub.
- **GitHub**: branch creation uses each user's own OAuth token (scopes `repo`, `admin:repo_hook`); not a shared PAT.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Multi-tenant (users → projects → members) | User wants a Linear-like team product, not a solo tool | — Pending |
| Email/password + GitHub OAuth login | Familiar account creation while keeping GitHub for repo features | — Pending |
| Invites via shareable link (no email service) | Stays free-tier; avoids email provider setup | — Pending |
| Owner + Member roles only | Sufficient guardrails for small teams without permission sprawl | — Pending |
| Per-project ticket counter via atomic UPDATE…RETURNING | Race-safe identifiers without multi-statement transactions over neon-http | — Pending |
| Per-user GitHub OAuth token for branch creation | Correct attribution in multi-tenant; shared PAT can't reach arbitrary users' repos | — Pending |
| Connect-GitHub gate for repo features | Email/password users have no GitHub token until they link | — Pending |
| Real-time board deferred to v2 | Optimistic UI + revalidation is enough for v1 and cheaper | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-01 after initialization*
