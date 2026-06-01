# Walking Skeleton — Linear-Clone Ticket System

**Phase:** 1
**Generated:** 2026-06-01

## Capability Proven End-to-End

A new user can create an account (email/password or GitHub OAuth), sign in, stay signed in across a browser refresh, view a protected `/dashboard` page showing their name + email + GitHub-connected status, and log out — all served by the Next.js app reading/writing a live Neon Postgres database.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.2.6 App Router + TypeScript (src-dir) | Single repo for frontend + API routes on Vercel Hobby free tier. Orchestrator chose `create-next-app@latest` (16.2.6) over CLAUDE.md's stated 15.x; App Router patterns identical. All other CLAUDE.md pins authoritative. |
| Data layer | Neon Postgres + Drizzle ORM, **dual driver** | App queries use `drizzle-orm/neon-http` (`db`, fast single-query). Better Auth uses `drizzle-orm/neon-serverless` WebSocket (`authDb`) — neon-http throws "No transactions support" for Better Auth's interactive transactions (#4747). `@neondatabase/serverless` pinned `^0.10.4` (v1.0.0 breaks neon-http, #5208). |
| Auth | Better Auth 1.6 (email/password + GitHub OAuth), database sessions, httpOnly cookie | Native Drizzle adapter; Organizations plugin available for Phase 2+ multi-tenancy. Email/password via bcryptjs/scrypt on Node runtime (never Edge). GitHub OAuth minimal scopes (read:user, user:email) — elevated scopes deferred to Phase 7. |
| Auth boundary | Server-side layout guard, NOT middleware | CVE-2025-29927 lets middleware be bypassed via spoofed `x-middleware-subrequest`. `auth.api.getSession({ headers })` in `app/dashboard/layout.tsx` is the security boundary. No cookie cache (RSC null bug #7008). |
| GitHub token | Plaintext in `account` table (Phase 1), read only via `getGitHubToken()` accessor; never in session JWT | D-03/D-04/D-05 — token has only read:user/user:email in Phase 1; accessor is the single seam for Phase 7 AES-256-GCM. Session carries only derived `githubConnected: boolean`. |
| Deployment target | Local full-stack run (`npm run dev`) against live Neon | Public Vercel deploy is Phase 9 (DEPLOY-01/02). Phase 1 proves the full stack locally against the real cloud DB. |
| Directory layout | `src/app` (routes + route groups), `src/lib` (auth, db, accessors), `src/db` (schema + migrations), `src/components/ui` (shadcn), `src/tests` (vitest) | Matches RESEARCH "Recommended Project Structure"; route group `(auth)` for login/signup. |
| Test runner | vitest + @vitejs/plugin-react | ESM-native, zero-config with Next 16 + TS; integration tests hit the real auth instance + DB. |
| UI | shadcn/ui (new-york) + Tailwind v4 (CSS-first) + lucide-react | CLAUDE.md locked. Components copied via CLI: button, input, label, card, badge, separator. |

## Stack Touched in Phase 1

- [x] Project scaffold (Next.js 16, TypeScript, Tailwind v4, ESLint, vitest)
- [x] Routing — `/login`, `/signup`, `/dashboard`, `/api/auth/[...all]`
- [x] Database — real write (user/session creation on signup/login) AND real read (session check, GitHub-account lookup); proven by `src/tests/db.test.ts`
- [x] UI — interactive login/signup forms + logout button wired to Better Auth; GitHub OAuth button
- [x] Deployment — documented local full-stack run (`npm run dev`) against live Neon (public Vercel deploy is Phase 9)

## Out of Scope (Deferred to Later Slices)

- Project CRUD and `requireProjectMember` authorization — Phase 2
- Invite links / membership management — Phase 3
- Project settings + GitHub repo linking — Phase 4
- Ticket CRUD + atomic per-project counter logic (the *constraint* exists now; the counter *logic* is Phase 5)
- Kanban board / drag-and-drop — Phase 6
- Elevated GitHub OAuth scopes (repo, admin:repo_hook) + "Connect GitHub" flow + branch creation — Phase 7
- AES-256-GCM encryption of the GitHub token — Phase 7 (accessor seam prepared now)
- Webhook registration + PR-driven status sync — Phase 8
- Public Vercel deployment + free-tier hardening — Phase 9
- Better Auth Organization plugin vs hand-rolled project tables (open question owned by Phase 2)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: Authenticated user creates a project (name + ticket key) and the server enforces membership before any project-scoped op
- Phase 3: Owner generates a copy-paste invite link; invited user joins; owner manages members
- Phase 4: Owner edits project name and links a GitHub repo
- Phase 5: Full ticket CRUD with atomic per-project identifiers + ticket detail page
- Phase 6: Five-column drag-and-drop kanban with persisted status changes
- Phase 7: Connect GitHub (elevated scopes) + create branch from a ticket
- Phase 8: Per-project webhook registration + PR open/merge auto-advances ticket status
- Phase 9: Deploy to public Vercel URL within free tiers
