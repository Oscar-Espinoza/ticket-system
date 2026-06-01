# Architecture Research

**Domain:** Multi-tenant Linear-style ticket/issue tracking system with GitHub integration
**Researched:** 2026-06-01
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                           │
│  React Server Components · Client Components · @dnd-kit board    │
├──────────────────────────────────────────────────────────────────┤
│                      Next.js App Router                           │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │  Page/Layout │  │ Server Actions  │  │   Route Handlers     │  │
│  │  (RSC data   │  │ (UI mutations:  │  │ (external callers:   │  │
│  │   fetching)  │  │  tickets, proj) │  │  GitHub webhooks,    │  │
│  └──────┬───────┘  └───────┬────────┘  │  invite token verify)│  │
│         │                  │           └──────────┬───────────┘  │
│  ┌──────▼──────────────────▼────────────────────▼─────────────┐  │
│  │              Data Access Layer (DAL)                         │  │
│  │   auth guard ➜ membership check ➜ Drizzle query             │  │
│  └─────────────────────────────────┬────────────────────────── ┘  │
├────────────────────────────────────┼─────────────────────────────┤
│                    Auth.js v5 (JWT sessions)                      │
│  Credentials provider · GitHub OAuth provider · Drizzle adapter  │
├────────────────────────────────────┼─────────────────────────────┤
│                    Neon Postgres (neon-http)                       │
│  users · accounts · projects · project_members · tickets          │
│  invitations · github_connections                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────▼────────────────┐
              │          GitHub REST API         │
              │  POST /git/refs  (branch create) │
              │  POST /repos/{}/hooks (webhooks) │
              │  Inbound: push · pull_request     │
              └─────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Key Files |
|-----------|----------------|-----------|
| Auth | Session lifecycle, sign-in/out, GitHub OAuth token capture | `src/auth.ts`, `src/middleware.ts`, `src/app/(auth)/` |
| Projects & Members | CRUD projects, invite link generation/acceptance, role enforcement | `src/app/(app)/projects/`, `src/lib/dal/projects.ts` |
| Tickets & Board | CRUD tickets, per-project counter, kanban drag-and-drop | `src/app/(app)/projects/[id]/board/`, `src/lib/dal/tickets.ts` |
| GitHub Integration | Branch creation, webhook registration, status sync | `src/lib/github/`, `src/app/api/webhooks/github/route.ts` |
| Data Access Layer | Auth guard + membership check wrapper used by all Server Actions and Route Handlers | `src/lib/dal/` |

---

## Recommended Project Structure

```
src/
├── app/
│   ├── (auth)/                  # Sign-in, sign-up, error pages
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (app)/                   # Authenticated shell (layout checks session)
│   │   ├── layout.tsx           # Shared nav, session provider
│   │   ├── dashboard/page.tsx   # Projects list
│   │   └── projects/
│   │       ├── new/page.tsx
│   │       └── [projectId]/
│   │           ├── layout.tsx   # Loads project + membership once
│   │           ├── board/page.tsx
│   │           ├── settings/page.tsx
│   │           └── members/page.tsx
│   ├── api/
│   │   ├── webhooks/
│   │   │   └── github/route.ts  # MUST be a Route Handler (raw body)
│   │   └── invites/
│   │       └── [token]/route.ts # GET for invite landing (redirect)
│   └── invites/
│       └── [token]/page.tsx     # Accept-invite UI page
├── auth.ts                      # Auth.js config (providers, callbacks, adapter)
├── middleware.ts                 # Auth.js middleware — redirects unauthenticated users
├── lib/
│   ├── db/
│   │   ├── index.ts             # Drizzle + neon-http client
│   │   └── schema.ts            # All table definitions
│   ├── dal/                     # Data Access Layer
│   │   ├── auth.ts              # getSession(), requireAuth()
│   │   ├── projects.ts          # requireProjectMember(projectId)
│   │   ├── tickets.ts
│   │   └── invitations.ts
│   ├── github/
│   │   ├── client.ts            # Build an Octokit instance from a user's token
│   │   ├── branches.ts          # createBranchForTicket()
│   │   └── webhooks.ts          # registerWebhook(), verifySignature()
│   └── actions/                 # Server Actions (thin wrappers over DAL)
│       ├── ticket-actions.ts
│       ├── project-actions.ts
│       └── github-actions.ts
└── components/
    ├── board/                   # KanbanBoard, TicketCard (@dnd-kit)
    ├── tickets/
    └── ui/                      # shadcn/ui re-exports
```

---

## Data Model

### Schema Overview

```
users (Auth.js core — extended with github_token_stored flag)
  id, name, email, emailVerified, image, password_hash (nullable)

accounts (Auth.js standard — stores GitHub OAuth access_token)
  userId → users.id
  provider, providerAccountId
  access_token, refresh_token, scope, expires_at …

projects
  id, name, ticket_key (e.g. "APP"), ticket_counter (integer, default 0)
  created_by → users.id
  github_repo_owner, github_repo_name (nullable — set after Connect GitHub)
  github_webhook_id (nullable — GitHub webhook ID for removal)
  github_webhook_secret (nullable — per-project HMAC secret)
  created_at

project_members
  project_id → projects.id (cascade delete)
  user_id    → users.id    (cascade delete)
  role       ENUM('owner','member')
  joined_at
  PRIMARY KEY (project_id, user_id)

invitations
  id, token (uuid, unique index)
  project_id → projects.id (cascade delete)
  created_by → users.id
  expires_at
  used_at (nullable — set when accepted)

tickets
  id, project_id → projects.id (cascade delete)
  ticket_number  (integer — the "42" in "APP-42")
  title, description (nullable)
  status         ENUM('backlog','todo','in_progress','in_review','done')
  assignee_id    → users.id (nullable)
  github_branch  (nullable — e.g. "app-42-fix-login")
  created_by     → users.id
  created_at, updated_at
  UNIQUE (project_id, ticket_number)
```

Auth.js tables used as-is: `accounts`, `sessions` (unused — JWT strategy), `verification_tokens`. The `accounts.access_token` column stores the GitHub OAuth token for each linked account.

### Relationship Diagram

```
users ──────┬──────── project_members ─────── projects
            │              │                      │
            │         (role: owner/member)        ├── tickets
            │                                     │     └── (ticket_number unique per project)
            └── accounts                          ├── invitations
                  └── (access_token per           └── (github_webhook_secret per project)
                       provider)
```

---

## Multi-Tenant Authorization Strategy

### Defense-in-Depth Layers

**Layer 1 — Middleware (UX redirect only):**
Auth.js v5 middleware runs on every non-static route via the `authorized` callback. It checks for a valid JWT session cookie and redirects unauthenticated users to `/login`. This is a UX convenience — it does NOT verify project membership or resource ownership. It must NOT be the only security check (CVE-2025-29927 demonstrated middleware bypass via crafted headers).

```typescript
// middleware.ts
export { auth as middleware } from '@/auth'
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login|register).*)'] }
```

**Layer 2 — Data Access Layer (security boundary):**
Every Server Action and Route Handler calls a DAL helper before touching the database. The DAL performs:
1. `requireAuth()` — get session, throw if missing
2. `requireProjectMember(projectId, userId)` — query `project_members`, throw if no row
3. (Owner-only actions) `requireProjectOwner(projectId, userId)` — check role === 'owner'

```typescript
// lib/dal/projects.ts
export async function requireProjectMember(projectId: string) {
  const session = await requireAuth()          // throws 401 if no session
  const member = await db.query.projectMembers.findFirst({
    where: and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, session.user.id)
    )
  })
  if (!member) throw new Error('FORBIDDEN')   // caught by Server Action / Route Handler
  return { session, member }
}
```

**Layer 3 — Query scoping:**
All ticket/member queries include `WHERE project_id = ?` and the project_id is always sourced from an authenticated context (never from client-supplied input alone). This prevents horizontal traversal even if a membership check is accidentally skipped.

### Where Each Check Lives

| Entry Point | Auth Check | Resource Check |
|-------------|------------|----------------|
| RSC page component | `auth()` call at top of component | `requireProjectMember()` in DAL |
| Server Action | `requireAuth()` in DAL helper | `requireProjectMember()` in DAL helper |
| Route Handler (invite accept) | Session check at top of handler | Invitation token lookup + expiry |
| Route Handler (GitHub webhook) | No session — HMAC signature is the auth | Per-project secret from DB |

---

## Architectural Patterns

### Pattern 1: Atomic Per-Project Ticket Counter

**What:** Single `UPDATE … RETURNING` to increment the `ticket_counter` column and return the new value atomically. No separate SELECT, no client-side increment, no transaction needed.

**Why this works over neon-http:** The neon-http driver executes each statement as a single non-interactive transaction on the Neon side. One `UPDATE … RETURNING` is always atomic in Postgres regardless of isolation level — the increment and read happen in the same write lock.

**Why not sequences:** Postgres sequences are per-database and not scoped to a project row. You'd need one sequence per project, requiring DDL at runtime — not feasible in a serverless environment.

**Why not transactions:** neon-http `transaction()` does support batched non-interactive transactions, but a single `UPDATE … RETURNING` is simpler, fewer round-trips, and achieves the same race-safety.

```typescript
// lib/dal/tickets.ts
async function nextTicketNumber(projectId: string): Promise<number> {
  const [updated] = await db
    .update(projects)
    .set({ ticketCounter: sql`${projects.ticketCounter} + 1` })
    .where(eq(projects.id, projectId))
    .returning({ ticketCounter: projects.ticketCounter })
  return updated.ticketCounter
}
```

Confidence: HIGH — standard Postgres pattern; confirmed compatible with neon-http's single-statement atomicity guarantee.

### Pattern 2: Per-User GitHub Token via Auth.js Accounts Table

**What:** When a user signs in with GitHub (or links GitHub via a secondary sign-in), Auth.js v5 stores the `access_token` in the `accounts` table row for `provider = 'github'`. To use the token, query the accounts table at action time — do not embed it in the JWT session.

**Why not in the session JWT:** GitHub tokens can be revoked or rotated. Keeping the canonical token in the database means the next action always fetches the current value rather than a stale JWT payload.

**Flow:**
```
Server Action: createBranch(ticketId, branchName)
  → requireProjectMember(projectId)
  → db: SELECT access_token FROM accounts WHERE userId = ? AND provider = 'github'
  → if null: return { error: 'GITHUB_NOT_CONNECTED' }
  → new Octokit({ auth: access_token })
  → GET /repos/{owner}/{repo}/git/ref/heads/{defaultBranch}  (get HEAD SHA)
  → POST /repos/{owner}/{repo}/git/refs  { ref: 'refs/heads/{branchName}', sha }
  → db: UPDATE tickets SET github_branch = branchName WHERE id = ticketId
```

**Auth.js jwt callback to expose github-connected flag (not the token itself):**
```typescript
// auth.ts callbacks
jwt({ token, account }) {
  if (account?.provider === 'github') {
    token.githubConnected = true
  }
  return token
},
session({ session, token }) {
  session.user.githubConnected = token.githubConnected ?? false
  return session
}
```

### Pattern 3: GitHub Webhook — Per-Project Secret, Route Handler Only

**What:** On connecting a repo, generate a cryptographically random secret, store it in `projects.github_webhook_secret`, and register the webhook with GitHub using that secret. The inbound handler at `POST /api/webhooks/github` extracts the `X-GitHub-Event` header and routes `pull_request` events to the appropriate ticket state transition.

**Why a Route Handler (not a Server Action):** Webhooks are machine callers. GitHub sends an HTTP POST; Server Actions can only be called from your own React app. The Route Handler also gives precise control to read the raw body before any JSON parsing — required for HMAC-SHA256 verification. Attempting `request.json()` before signature verification corrupts the raw body and makes verification impossible.

**Verification pattern (Web Crypto API — edge/Node compatible):**
```typescript
// app/api/webhooks/github/route.ts
export const runtime = 'nodejs' // avoid edge re-encoding
export async function POST(req: Request) {
  const rawBody = await req.text()                          // raw bytes first
  const sig = req.headers.get('x-hub-signature-256') ?? ''
  const project = await db.query.projects.findFirst({
    where: eq(projects.githubWebhookId, /* from payload */ webhookId)
  })
  const valid = await verifyGitHubSignature(project.githubWebhookSecret, sig, rawBody)
  if (!valid) return new Response('Forbidden', { status: 403 })

  const event = req.headers.get('x-github-event')
  const payload = JSON.parse(rawBody)
  if (event === 'pull_request') await handlePullRequestEvent(payload)
  return new Response('OK', { status: 200 })
}

async function verifyGitHubSignature(secret: string, header: string, body: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  )
  const sigBytes = hexToBytes(header.replace('sha256=', ''))
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(body))
}
```

**Auth.js middleware must NOT protect `/api/webhooks/github`** — add this path to the middleware matcher exclusion list.

**Status transitions on `pull_request` events:**

| GitHub action | Ticket status transition |
|---------------|--------------------------|
| `opened` / `reopened` | `in_progress` → `in_review` |
| `closed` + `merged: true` | any → `done` |
| `closed` + `merged: false` | `in_review` → `in_progress` |

Branch-to-ticket matching: query `WHERE github_branch = payload.pull_request.head.ref AND project_id = <project from repo name lookup>`.

---

## Data Flow

### Branch Creation Flow

```
User clicks "Create Branch" on ticket card
  │
  ▼ (Client Component submits)
Server Action: createBranchForTicket(ticketId, branchName)
  │
  ├─ requireProjectMember(projectId)         [DAL: membership check]
  │
  ├─ SELECT access_token FROM accounts       [is GitHub connected?]
  │   WHERE userId = ? AND provider = 'github'
  │   → if null: return { error: 'github_not_connected' }
  │
  ├─ SELECT github_repo_owner, github_repo_name FROM projects WHERE id = ?
  │   → if null: return { error: 'repo_not_configured' }
  │
  ├─ GET /repos/{owner}/{repo}/git/ref/heads/{defaultBranch}
  │   → extract sha (HEAD commit SHA)
  │
  ├─ POST /repos/{owner}/{repo}/git/refs
  │   body: { ref: 'refs/heads/{branchName}', sha }
  │
  ├─ UPDATE tickets SET github_branch = branchName, status = 'in_progress'
  │   WHERE id = ticketId
  │
  └─ revalidatePath(...)  → board re-renders with branch link
```

### Webhook Status Sync Flow

```
GitHub PR opened/merged
  │
  ▼ POST /api/webhooks/github
Route Handler
  │
  ├─ rawBody = await req.text()              [MUST be before JSON parse]
  ├─ signature = req.headers.get('x-hub-signature-256')
  │
  ├─ Look up project by repo full_name in payload
  │   (projects.github_repo_owner + github_repo_name)
  │
  ├─ verifyGitHubSignature(project.githubWebhookSecret, signature, rawBody)
  │   → 403 on failure
  │
  ├─ Parse event type from X-GitHub-Event header
  │
  └─ pull_request event:
      ├─ branchName = payload.pull_request.head.ref
      ├─ SELECT id, status FROM tickets
      │   WHERE project_id = ? AND github_branch = branchName
      └─ UPDATE tickets SET status = <new_status>
          → 200 OK (GitHub requires <10s response)
```

### Invite Accept Flow

```
User visits /invites/[token]  (page component)
  │
  ├─ Route Handler GET /api/invites/[token]
  │   OR page directly: query invitations WHERE token = ? AND used_at IS NULL AND expires_at > NOW()
  │   → 404 / "expired" page if invalid
  │
  ├─ If user is not logged in: redirect to /login?callbackUrl=/invites/[token]
  │
  ├─ Server Action: acceptInvite(token)
  │   ├─ requireAuth()
  │   ├─ SELECT invitation WHERE token = ? (re-validate)
  │   ├─ INSERT INTO project_members (project_id, user_id, role = 'member')
  │   │   ON CONFLICT DO NOTHING  (idempotent — re-clicking invite is safe)
  │   ├─ UPDATE invitations SET used_at = NOW() WHERE token = ?
  │   └─ redirect('/projects/{projectId}/board')
```

---

## Build Order

Build in dependency order — later phases depend on the components built in earlier ones.

### Phase 1: Foundation (Auth + Database)
- Drizzle schema (all tables), neon-http connection
- Auth.js v5: Credentials + GitHub providers, Drizzle adapter, JWT session + `githubConnected` flag
- Middleware: redirect unauthenticated → `/login`
- Basic sign-in / sign-up / sign-out pages

**Gate:** Can create accounts, log in with email/password and GitHub, see a protected dashboard page.

### Phase 2: Projects & Multi-Tenancy
- Project creation (name + ticket_key)
- `project_members` + `requireProjectMember()` DAL helper
- Invite link generation + acceptance flow (no email — copy/paste URL)
- Project settings: manage members, transfer ownership, delete

**Gate:** User can create a project, share an invite link, invite accepts and sees the project.

### Phase 3: Tickets & Kanban Board
- Ticket creation with atomic `UPDATE … RETURNING` counter
- Ticket CRUD (title, description, assignee)
- Kanban board with @dnd-kit (drag triggers Server Action status update)
- Assignee picker (project members only)

**Gate:** Tickets are created as "APP-1", "APP-2" etc.; board drag-and-drop works.

### Phase 4: GitHub Integration
- "Connect GitHub" flow (users link GitHub OAuth account if signed up with email/password)
- Project: configure repo (owner/repo picker via GitHub API)
- Branch creation Server Action (with `github_not_connected` guard)
- Per-project webhook registration (generate secret, call GitHub API, store webhook_id + secret)
- Inbound webhook Route Handler: raw body → HMAC verify → status transitions

**Gate:** Create branch from ticket; open a PR and watch the ticket move to "in review"; merge and watch it go to "done".

### Phase 5: Polish & Deploy
- Error states and loading UIs
- Optimistic UI for board drag
- Vercel deployment, environment variable audit
- Free-tier usage check (Neon 512 MB, Vercel hobby limits)

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Middleware as Authorization Boundary

**What people do:** Check `auth()` in middleware and assume that if execution reaches a Server Action, the user is authorized.

**Why it's wrong:** Middleware can be bypassed (CVE-2025-29927). Middleware also cannot run async DB queries efficiently in edge environments to verify project membership.

**Do this instead:** Every Server Action calls `requireProjectMember(projectId)` in the DAL. Middleware is only for the unauthenticated redirect.

### Anti-Pattern 2: request.json() Before Signature Verification in Webhook Handler

**What people do:** `const body = await request.json()` at the top, then try to re-serialize for HMAC.

**Why it's wrong:** Re-serializing JSON changes byte ordering and whitespace. The hash will never match GitHub's signature.

**Do this instead:** `const rawBody = await request.text()` first, verify HMAC against rawBody, then `JSON.parse(rawBody)`.

### Anti-Pattern 3: Storing GitHub Token in JWT Session

**What people do:** Put `access_token` in the JWT callback so it's available in `session.user.githubToken`.

**Why it's wrong:** GitHub tokens can be revoked by the user at any time. A stale token in a long-lived JWT will cause silent failures on branch creation. The accounts table is the canonical source of truth.

**Do this instead:** Fetch the token from the `accounts` table at action time. Only store a boolean `githubConnected` flag in the session for UI gating.

### Anti-Pattern 4: Client-Side Ticket Number Increment

**What people do:** `SELECT MAX(ticket_number) + 1` then `INSERT` in two separate statements (even in a client transaction over neon-http).

**Why it's wrong:** Two concurrent requests can read the same MAX and produce duplicate ticket numbers. neon-http's `transaction()` uses non-interactive transactions that do not hold row locks between round-trips.

**Do this instead:** Single `UPDATE projects SET ticket_counter = ticket_counter + 1 … RETURNING ticket_counter`.

### Anti-Pattern 5: Shared Webhook Route Without Project Disambiguation

**What people do:** One webhook URL per app, looking up the project by repo name alone.

**Why it's wrong:** Two projects could theoretically be connected to the same repo. Also the signature verification key is per-project; you must look up the project before you can verify the signature.

**Do this instead:** Include the project ID in the webhook URL path (`/api/webhooks/github/[projectId]`) OR look up the project by `github_repo_owner + github_repo_name` and verify the signature using that project's secret. The path-based approach is simpler and more explicit.

---

## Integration Points

### External Services

| Service | Integration Pattern | Key Notes |
|---------|---------------------|-----------|
| GitHub OAuth | Auth.js GitHub provider — issues `accounts` row with `access_token`, `scope: repo admin:repo_hook` | Token fetched from DB at action time, not session |
| GitHub REST API (branch) | Per-user Octokit instance built from `accounts.access_token` | `GET /git/ref/heads/{default}` to get HEAD SHA, then `POST /git/refs` |
| GitHub REST API (webhook registration) | Server Action builds Octokit from user token, calls `POST /repos/{owner}/{repo}/hooks` | Store returned `id` as `projects.github_webhook_id` |
| GitHub Webhooks (inbound) | Route Handler at `/api/webhooks/github/[projectId]` | Raw body → HMAC → parse → update ticket status |
| Neon Postgres | Drizzle + `neon-http` driver | HTTP driver; single-statement atomicity sufficient; use `transaction()` only if truly multi-statement |
| Vercel | Standard Next.js deployment | Serverless functions, no persistent WebSocket state; all GitHub webhook responses must be < 10s |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| React Components ↔ Server Actions | Direct function call (`'use server'`) | Type-safe, no fetch needed for mutations |
| Server Actions ↔ DAL | Direct function calls | DAL enforces auth + membership before any DB access |
| Route Handlers ↔ DAL | Direct function calls | Webhook handler bypasses auth DAL; uses HMAC as auth instead |
| GitHub Integration ↔ DAL | GitHub functions call DAL for token + project config | Never embed GitHub logic in Server Actions directly |
| Auth.js ↔ Schema | DrizzleAdapter reads/writes `users`, `accounts`, `sessions`, `verification_tokens` | Do not manually write to Auth.js tables; use Auth.js APIs |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–500 users | Current architecture: monolith, neon-http, JWT sessions — no changes needed |
| 500–10K users | Add Neon read replicas for board queries; consider `neon-ws` driver for interactive transactions if needed; add rate limiting to webhook handler |
| 10K+ users | Extract webhook processing to a queue (Upstash QStash or similar); separate read/write Drizzle clients pointing at replica/primary; evaluate real-time with Supabase Realtime or Ably |

Current design deliberately optimizes for zero-cost free-tier operation. All scaling concerns are v2+ territory.

---

## Sources

- [Auth.js Drizzle Adapter — table schema](https://authjs.dev/getting-started/adapters/drizzle) — HIGH confidence
- [Auth.js v5 pg.ts schema source](https://github.com/nextauthjs/next-auth/blob/main/packages/adapter-drizzle/src/lib/pg.ts) — HIGH confidence
- [Auth.js v5 Protecting routes / authorized callback](https://authjs.dev/getting-started/session-management/protecting) — HIGH confidence
- [Server Actions vs Route Handlers — MakerKit](https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers) — HIGH confidence
- [GitHub webhook signature verification — official docs](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) — HIGH confidence
- [GitHub REST API — create git ref (branch)](https://docs.github.com/en/rest/git/refs) — HIGH confidence
- [Neon serverless HTTP driver — transaction support](https://neon.com/docs/serverless/serverless-driver) — HIGH confidence
- [Drizzle ORM — Relations](https://orm.drizzle.team/docs/relations) — HIGH confidence
- [Next.js authorization patterns — Robin Wieruch](https://www.robinwieruch.de/next-authorization/) — MEDIUM confidence
- [Next.js security — CVE-2025-29927 middleware bypass](https://www.authgear.com/post/nextjs-security-best-practices/) — MEDIUM confidence

---
*Architecture research for: Multi-tenant ticket tracking system with GitHub integration*
*Researched: 2026-06-01*
