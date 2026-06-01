# Stack Research

**Domain:** Multi-tenant ticket/issue tracking with GitHub integration (Linear-style)
**Researched:** 2026-06-01
**Confidence:** MEDIUM-HIGH (versions verified via official sources and npm; some compatibility hazards discovered and documented)

---

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

---

## Detailed Rationale per Stack Decision

### Auth: Better Auth 1.6 (not Auth.js v5)

**Decision:** Use Better Auth instead of Auth.js v5 (NextAuth).

**Why:** As of September 2025, the Better Auth team acquired the Auth.js project. Auth.js v5 remains perpetually at `5.0.0-beta.31` — never shipped a stable release — and the official Auth.js docs now direct new projects to Better Auth. The project is in security-patch mode only.

Better Auth is a strong replacement for this specific project because:
- Native Drizzle adapter (no separate `@auth/drizzle-adapter` package)
- Organizations plugin handles multi-tenancy (members, invites, roles) out of the box — this maps directly to the project's workspace model
- email/password + GitHub OAuth are supported natively
- JWT sessions are supported (stateless, no sessions table required)
- Actively developed: 1.6.13 shipped June 2026

**If Auth.js is preferred anyway:** `next-auth@5.0.0-beta.31` + `@auth/drizzle-adapter` works and is documented. The Credentials provider + GitHub provider + JWT session strategy is well-tested. The risk is that v5 may never leave beta and future security patches will be slower. See Alternatives section.

### Database Driver: neon-http vs neon-websockets

**Decision:** Use `drizzle-orm/neon-http` for application queries **but** be aware of two live compatibility issues.

**neon-http is the right default** for serverless (Vercel) because:
- Each function invocation is stateless; HTTP is faster than establishing a WebSocket for single queries
- Vercel Hobby functions have 250ms warm-start budget; WebSocket setup adds overhead
- neon-http supports non-interactive (batched) multi-statement transactions via the `transaction()` function — sufficient for most app needs

**Critical exception — authentication layer:** Better Auth wraps user creation in interactive transactions. The `neon-http` driver does **not** support interactive transactions. Better Auth issue #4747 documented this; the resolution is to use `drizzle-orm/neon-postgres` (the WebSocket variant) for the Better Auth database instance.

**Pattern to use:**
```typescript
// auth.ts — use WebSocket driver for Better Auth (needs interactive transactions)
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const authDb = drizzleWs({ client: pool });

// db.ts — use HTTP driver for app queries (faster for read/write)
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql });
```

Both instances hit the same Neon database; same schema, different drivers for different use cases.

**Version pin:** Pin `@neondatabase/serverless` to `^0.10.4` in `package.json`. Version 1.0.0 (released late 2025) broke `drizzle-orm/neon-http` by requiring tagged-template syntax. As of January 2026, Drizzle ORM has an open bug (issue #5208) tracking the fix. Reassess when `drizzle-orm@0.40+` ships.

### Password Hashing: bcryptjs on Node runtime

**Decision:** Use `bcryptjs@2.4.x`. Do **not** use Edge runtime for any route that hashes passwords.

**Comparison:**

| Option | Serverless OK? | Edge Runtime | Security | Notes |
|--------|----------------|--------------|----------|-------|
| `bcryptjs` | YES (Node) | NO | Good (cost=12, ~250ms) | Pure JS, no native compile, ~4KB memory |
| `node:crypto scrypt` | YES (Node) | NO | Very Good | Built-in, zero dependencies; async API |
| `@node-rs/argon2` | YES (Node) | NO | Best | Requires native addon, Vercel compiles it but adds build complexity |
| `Web Crypto PBKDF2` | YES (Edge) | YES | Acceptable | Only option that works on Edge; weaker than bcrypt at equivalent speed |

**Recommendation:** `bcryptjs` is the safe default. It compiles to pure JS (no native addon), runs on Vercel's Node.js runtime, and has 25 years of security scrutiny. `node:crypto scrypt` is a reasonable upgrade (ships with Node, no extra dependency) but requires manual salt handling and the callback API. `@node-rs/argon2` is theoretically stronger but adds native build complexity on Vercel.

**Constraint:** Ensure login/signup routes use `runtime = 'nodejs'` (the default for App Router route handlers). Do **not** put auth handlers in middleware or any Edge-runtime route.

### Tailwind + shadcn/ui: v4

**Decision:** Use Tailwind CSS v4 + shadcn/ui for new projects.

**Why v4:** The `shadcn@latest init` CLI now scaffolds Tailwind v4 by default. v4 removes `tailwind.config.js` — all configuration lives in `globals.css` under `@theme`. Components are updated for React 19 (`forwardRef` removed, `data-slot` attributes added). Colors migrated from HSL to OKLCH.

**What changes:** No `tailwind.config.js`. Import `@import "shadcn/tailwind.css"` in `globals.css`. Animation handled by `tw-animate-css` instead of `tailwindcss-animate`. Style default is `new-york` for new projects.

**Backward compatibility:** If the team has strong v3 opinions, v3 still works — just use `shadcn@latest init` and decline v4 during prompts. The components will be scaffolded in v3/React 18 mode.

### Kanban: @dnd-kit/react (new API, not @dnd-kit/core)

**Decision:** Use `@dnd-kit/react@0.4.x` + `@dnd-kit/helpers`, not the legacy `@dnd-kit/core`.

**Why:** The new `@dnd-kit/react` is the current maintained API. `@dnd-kit/core` is the legacy package (last published ~1 year ago, v6.3.1). `@dnd-kit/react@0.4.0` fixed TypeScript compatibility with React 19 types. For kanban: use `useSortable` from `@dnd-kit/react` and `move()` from `@dnd-kit/helpers` for column reordering.

**Note:** `@dnd-kit/react` is at version 0.4.x — the minor version signals it's still maturing. The API is stable enough for this use case; the library has a migration guide if 1.0 introduces changes.

### GitHub API: @octokit/rest

**Decision:** Use `@octokit/rest@22.0.x` (typed REST client), not raw `fetch`.

**Why:** `@octokit/rest` provides typed methods for every GitHub REST operation needed:
- `octokit.rest.git.createRef()` — creates a branch
- `octokit.rest.repos.createWebhook()` — registers the webhook
- `octokit.rest.repos.deleteWebhook()` — removes the webhook on disconnect

Raw `fetch` is an option but requires manual header management, pagination handling, and no type safety on responses. `@octokit/rest` costs ~40KB gzipped and runs in Node.js and browser contexts.

**Usage pattern:** Instantiate with the user's stored OAuth access token per request; never cache across users.
```typescript
import { Octokit } from "@octokit/rest";
const octokit = new Octokit({ auth: user.githubAccessToken });
await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha });
```

---

## Installation

```bash
# Next.js scaffold (includes TypeScript, Tailwind v4, App Router, ESLint)
npx create-next-app@latest ticket-system --typescript --tailwind --eslint --app

# Core runtime dependencies
npm install better-auth drizzle-orm "@neondatabase/serverless@^0.10.4" bcryptjs @octokit/rest

# UI
npm install lucide-react
npx shadcn@latest init   # follow prompts; selects Tailwind v4 + new-york style

# Drag and drop
npm install @dnd-kit/react @dnd-kit/helpers

# Dev dependencies
npm install -D drizzle-kit @types/bcryptjs
```

---

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

---

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

---

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

---

## Serverless-Specific Gotchas Summary

1. **Neon driver version pin.** `@neondatabase/serverless@1.0.0` broke `drizzle-orm/neon-http`. Pin to `^0.10.4` and track [drizzle-orm#5208](https://github.com/drizzle-team/drizzle-orm/issues/5208).

2. **Two Drizzle instances.** Better Auth needs a WebSocket-based db instance for transaction support. Application code should use the HTTP-based instance for lower latency. Both point at the same Neon database.

3. **Password hashing is Node-only.** bcryptjs cannot run on the Edge. All auth route handlers must use the Node.js runtime (the default). Never import bcryptjs into middleware.

4. **Webhook raw body.** GitHub webhook signature verification requires reading the raw body with `await request.text()` **before** any JSON parsing. In Next.js App Router route handlers, calling `.json()` first consumes the body stream and prevents raw access. The pattern: read `.text()`, verify HMAC-SHA256 signature, then `JSON.parse()` manually.

5. **GitHub OAuth token storage.** The "Connect GitHub" flow stores the user's OAuth access token in the database (on the Better Auth `account` record, `accessToken` field). This token is scoped to `repo` + `admin:repo_hook`. It is per-user — never shared. Gate branch creation and webhook registration behind a check that `account.accessToken` is non-null.

6. **Vercel function timeout.** Vercel Hobby functions have a 10-second execution limit. Octokit calls and Neon queries must both complete within this. For webhook handlers, respond 200 immediately and process asynchronously if needed (background processing is limited on Hobby tier — keep handlers fast).

---

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

---
*Stack research for: multi-tenant Linear-style ticket system with GitHub integration*
*Researched: 2026-06-01*
