<!-- GSD:project-start source:PROJECT.md -->
## Project

**Linear-Clone Ticket System**

A zero-cost, full-stack Linear-style ticket management system for small teams. Users create an account, start a project, and invite collaborators by shareable link. Tickets move through a drag-and-drop kanban board, and projects connect to GitHub so tickets can spawn branches and auto-update status when pull requests are opened and merged.

**Core Value:** A ticket's status stays in sync with real GitHub work — create a branch from a ticket and merging its PR automatically marks the ticket done — without paying for any hosted service.

### Constraints

- **Tech stack**: Next.js 15 App Router + TypeScript — one repo for frontend + API routes, no separate backend.
- **Database**: Neon Postgres + Drizzle ORM (`neon-http` driver) — serverless-friendly, free tier.
- **Auth**: Better Auth 1.6 with Drizzle adapter — email/password + GitHub OAuth; Organization plugin for multi-tenant members + invitations. (Auth.js v5 was the original choice but is now deprecated/security-patch-only.)
- **DB drivers**: `neon-http` for app queries + `neon-serverless` (WebSocket) for Better Auth's transactional writes. Pin `@neondatabase/serverless@^0.10.4` (v1.0.0 broke `neon-http`).
- **Styling**: Tailwind CSS v4 + shadcn/ui components + lucide-react icons.
- **Board**: @dnd-kit/react (0.4.x) for drag-and-drop (not the legacy @dnd-kit/core).
- **GitHub API**: @octokit/rest v22, instantiated per-request with the user's stored OAuth token.
- **Budget**: $0 — must stay within free tiers of Neon, Vercel, and GitHub.
- **GitHub**: branch creation uses each user's own OAuth token (scopes `repo`, `admin:repo_hook`); not a shared PAT.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 15.x (latest) | Full-stack framework — App Router + API routes | Official Vercel stack; App Router is now the recommended default; single repo for frontend + server functions on Vercel Hobby free tier |
| TypeScript | 5.x | Type safety across the whole codebase | Next.js 15 ships TypeScript support out of the box; eliminates a class of runtime bugs in auth and DB layers |
| Neon Postgres | — (cloud) | Primary database — free 512 MB tier | Serverless Postgres that scales to zero; free tier sufficient for the project; Drizzle has first-class Neon support |
| Drizzle ORM | 0.39.x | Type-safe SQL ORM + migrations | Thin abstraction over SQL; generated types match schema exactly; drizzle-kit handles migrations without a separate service |
| @neondatabase/serverless | **pin to 0.10.x** | Neon driver used by drizzle-orm/neon-http | **CRITICAL: v1.0.0 introduced a breaking API change that breaks drizzle-orm/neon-http as of January 2026 (see Pitfalls). Pin to 0.10.4 until Drizzle ships a fix.** |
| Better Auth | 1.6.x | Authentication — email/password + GitHub OAuth | Official recommendation for new projects; Auth.js v5 is now in security-patch-only mode under Better Auth team ownership. Better Auth has native Drizzle adapter, Organizations plugin for multi-tenancy, and an invitation system built in |
| Tailwind CSS | 4.x | Utility-first CSS framework | shadcn/ui CLI now initializes with v4 by default for new projects; v4 removes `tailwind.config.js` in favor of CSS-first configuration |
| shadcn/ui | latest (CLI) | Accessible component primitives | Not a versioned npm package — components are copied into your repo via CLI; new installs get Tailwind v4 + React 19 compatible versions; uses `new-york` style by default |
| lucide-react | latest | Icon library | Default icon set for shadcn/ui; tree-shakeable; actively maintained |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @dnd-kit/react | 0.4.x | Drag-and-drop kanban board | New API (replaces legacy @dnd-kit/core); React 19 type-compatible as of 0.4.x; use with @dnd-kit/helpers for the `move()` utility in column reordering |
| @dnd-kit/helpers | latest | Sortable array utilities (`move()`) | Required alongside @dnd-kit/react for the reorder-on-drop pattern |
| @octokit/rest | 22.0.x | GitHub REST API client | Typed wrapper for branch creation (`git/refs`) and webhook management (`hooks`); v22 drops Node 18 support (Node 20+ required — Vercel uses Node 20) |
| bcryptjs | 2.4.x | Password hashing | Pure-JS bcrypt; runs in Node.js runtime (not Edge); no native addon compilation required; predictable memory profile for serverless. See password-hashing section for tradeoffs |
| drizzle-kit | 0.30.x | Schema migrations CLI | Dev dependency; run locally or in CI to generate and apply SQL migrations |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| drizzle-kit | Schema migrations | `drizzle-kit generate` creates SQL migration files; `drizzle-kit push` applies them to Neon directly (good for dev); `drizzle-kit migrate` for prod |
| ESLint + TypeScript-ESLint | Linting | Included in `create-next-app` scaffold |
| Prettier | Formatting | Add manually; shadcn/ui CLI does not configure it |
## Detailed Rationale per Stack Decision
### Auth: Better Auth 1.6 (not Auth.js v5)
- Native Drizzle adapter (no separate `@auth/drizzle-adapter` package)
- Organizations plugin handles multi-tenancy (members, invites, roles) out of the box — this maps directly to the project's workspace model
- email/password + GitHub OAuth are supported natively
- JWT sessions are supported (stateless, no sessions table required)
- Actively developed: 1.6.13 shipped June 2026
### Database Driver: neon-http vs neon-websockets
- Each function invocation is stateless; HTTP is faster than establishing a WebSocket for single queries
- Vercel Hobby functions have 250ms warm-start budget; WebSocket setup adds overhead
- neon-http supports non-interactive (batched) multi-statement transactions via the `transaction()` function — sufficient for most app needs
### Password Hashing: bcryptjs on Node runtime
| Option | Serverless OK? | Edge Runtime | Security | Notes |
|--------|----------------|--------------|----------|-------|
| `bcryptjs` | YES (Node) | NO | Good (cost=12, ~250ms) | Pure JS, no native compile, ~4KB memory |
| `node:crypto scrypt` | YES (Node) | NO | Very Good | Built-in, zero dependencies; async API |
| `@node-rs/argon2` | YES (Node) | NO | Best | Requires native addon, Vercel compiles it but adds build complexity |
| `Web Crypto PBKDF2` | YES (Edge) | YES | Acceptable | Only option that works on Edge; weaker than bcrypt at equivalent speed |
### Tailwind + shadcn/ui: v4
### Kanban: @dnd-kit/react (new API, not @dnd-kit/core)
### GitHub API: @octokit/rest
- `octokit.rest.git.createRef()` — creates a branch
- `octokit.rest.repos.createWebhook()` — registers the webhook
- `octokit.rest.repos.deleteWebhook()` — removes the webhook on disconnect
## Installation
# Next.js scaffold (includes TypeScript, Tailwind v4, App Router, ESLint)
# Core runtime dependencies
# UI
# Drag and drop
# Dev dependencies
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Better Auth 1.6 | Auth.js v5 (next-auth@5.0.0-beta.31) | If migrating an existing Auth.js codebase; or if the team already knows Auth.js well and accepts the beta/maintenance risk |
| drizzle-orm/neon-http (app queries) | drizzle-orm/neon-postgres (WebSocket) | Use WebSocket variant everywhere if you hit neon-http bugs, at the cost of slightly more connection overhead |
| @dnd-kit/react | react-beautiful-dnd / @hello-pangea/dnd | Neither supports React 19 reliably as of 2025-2026; avoid |
| @dnd-kit/react | Pragmatic Drag and Drop (Atlassian) | If you need more complex tree drag-and-drop beyond kanban; heavier dependency |
| @octokit/rest | raw fetch | Only if bundle size is a strict constraint; saves ~40KB but loses types |
| bcryptjs | node:crypto scrypt | Slightly better security posture, zero npm dependency; requires manual salt + async callback wrangling |
| Tailwind v4 | Tailwind v3 | If team has heavy existing v3 config or uses plugins incompatible with v4 |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@neondatabase/serverless@^1.0.0` | Breaking API change breaks `drizzle-orm/neon-http` as of v1.0.0 (open Drizzle bug #5208, Jan 2026) | Pin to `^0.10.4` until Drizzle ships the neon-http adapter fix |
| `drizzle-orm/neon-http` for Better Auth's database instance | Better Auth uses interactive transactions; neon-http throws "No transactions support" (Better Auth issue #4747) | Use `drizzle-orm/neon-serverless` (WebSocket) for the auth db instance |
| Auth.js v5 (next-auth@5.0.0-beta) for new projects | Still in beta after 2+ years; project now in security-patch mode; maintainers redirect new users to Better Auth | Better Auth 1.6 |
| `bcryptjs` in middleware / Edge routes | bcryptjs uses `process.nextTick` and Node crypto, which are not available in the Vercel Edge runtime | Keep login/signup in Node.js runtime route handlers |
| `@dnd-kit/core` (legacy) | Last published ~1 year ago; superseded by `@dnd-kit/react` | `@dnd-kit/react@0.4.x` |
| react-beautiful-dnd / @hello-pangea/dnd | Poor React 19 peer dependency support | `@dnd-kit/react` |
| Prisma | Heavier than Drizzle, slower cold starts in serverless, more complex migrations on Vercel | Drizzle ORM |
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `drizzle-orm@0.39.x` | `@neondatabase/serverless@^0.10.4` | Breaks with `@neondatabase/serverless@^1.0.0`; Drizzle bug #5208 open as of Jan 2026 |
| `better-auth@1.6.x` | `drizzle-orm/neon-serverless` (WebSocket) | neon-http driver causes "No transactions support" error on user creation; use WebSocket driver for auth db |
| `@dnd-kit/react@0.4.x` | React 19 | TypeScript types fixed in 0.4.x for React 19 readonly refs |
| `@octokit/rest@22.0.x` | Node.js 20+ | v22 dropped Node 18; Vercel Hobby uses Node 20 by default — compatible |
| `next-auth@5.0.0-beta` | `@auth/drizzle-adapter@latest` | If using Auth.js v5 path: requires explicit `session: { strategy: "jwt" }` in config when using Drizzle adapter (default flips to "database" when any adapter is present) |
| Tailwind CSS v4 | shadcn/ui (new installs) | New `shadcn@latest init` scaffolds v4; components use `@theme` directive, OKLCH colors, `tw-animate-css` |
| `bcryptjs@2.4.x` | Next.js App Router Node runtime | Must NOT be imported in middleware.ts or any route segment with `export const runtime = 'edge'` |
## Serverless-Specific Gotchas Summary
## Sources
- [Auth.js official migration to Better Auth](https://authjs.dev/getting-started/migrate-to-better-auth) — confirmed Auth.js is now under Better Auth team; new projects directed to Better Auth
- [Auth.js Drizzle adapter docs](https://authjs.dev/getting-started/adapters/drizzle) — schema tables, JWT strategy configuration
- [Neon serverless driver docs](https://neon.com/docs/serverless/serverless-driver) — HTTP vs WebSocket capabilities/limitations
- [Drizzle connect-neon docs](https://orm.drizzle.team/docs/connect-neon) — neon-http and neon-serverless setup
- [drizzle-orm#5208](https://github.com/drizzle-team/drizzle-orm/issues/5208) — `@neondatabase/serverless@1.0.0` breaking change vs neon-http (open Jan 2026)
- [better-auth#4747](https://github.com/better-auth/better-auth/issues/4747) — neon-http + interactive transactions incompatibility
- [better-auth#3678](https://github.com/better-auth/better-auth/issues/3678) — neon-http tagged-template syntax incompatibility
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — v4 migration, breaking changes, new defaults
- [shadcn/ui Next.js install docs](https://ui.shadcn.com/docs/installation/next) — CLI init for new projects
- [dndkit.com React quickstart](https://dndkit.com/react/quickstart/) — @dnd-kit/react vs legacy @dnd-kit/core distinction
- [Neon auth comparison guide](https://neon.com/guides/nextauth-neon-auth-better-auth-postgres) — Auth.js vs Better Auth tradeoffs for Postgres
- [@octokit/rest v22 docs](https://octokit.github.io/rest.js/v22/) — current version, Node 20 requirement
- [Better Auth organization plugin](https://better-auth.com/docs/plugins/organization) — multi-tenancy schema, roles, invitations
- [Better Auth 1.6 release](https://better-auth.com/blog/1-6) — current stable version features
- [bcryptjs Edge runtime issues](https://github.com/nextjs/saas-starter/issues/118) — confirmed bcryptjs unsupported on Vercel Edge runtime
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
