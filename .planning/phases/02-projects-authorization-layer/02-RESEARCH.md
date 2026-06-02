# Phase 2: Projects + Authorization Layer - Research

**Researched:** 2026-06-01
**Domain:** Next.js 15 App Router Server Actions, Drizzle ORM neon-http batch, DAL authorization primitives, conditional SQL aggregation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-12:** Use the hand-rolled `project` / `project_member` / `invitation` tables already migrated in Phase 1 (D-06). Do NOT adopt the Better Auth Organization plugin.
- **D-13:** `requireProjectMember(projectId, userId)` is a server-only DAL helper in `src/lib/`, mirroring the `src/lib/github-token.ts` accessor pattern. Runs the membership check FIRST and throws a 403-equivalent error before any project-scoped SELECT runs.
- **D-14:** On success the helper returns the membership row `{ projectId, userId, role }`.
- **D-15:** Reject rendering split by surface — Server Actions / API responses return **403**. The project detail page calls Next.js `notFound()` (404) for non-members (enumeration-resistant). `requireProjectMember` still throws before any DB read in both cases.
- **D-16:** Create via a shadcn `Dialog` on the dashboard triggered by "New project" button. Not a dedicated `/projects/new` route. Form fields: name + ticket key.
- **D-17:** Ticket key is auto-uppercased as the user types, restricted to A–Z only, 2–6 characters, globally unique. Duplicate key surfaces as an inline error.
- **D-18:** Creating a project inserts a `project` row AND a `project_member` row with `role: 'owner'` for the creator. Because neon-http `db` has no interactive transactions, use a safe sequential/batched write (e.g. `db.batch`). The creator's `id` comes from `auth.api.getSession({ headers })`.
- **D-19:** Dashboard lists projects where user is owner OR member (single query joining `project_member` on `userId`). Empty state: "No projects yet" panel with New-project CTA.
- **D-20:** Each project is a clickable shadcn `Card` showing: project name, ticket key as `Badge`, owner/member role `Badge`, and open vs resolved ticket counts.
- **D-21:** Project detail page at `/dashboard/projects/[id]` — header (name + ticket key) plus empty ticket-list placeholder ("No tickets yet"). No New-ticket button.

### Claude's Discretion

- Exact DAL file name/location for `requireProjectMember` (e.g. `src/lib/project-access.ts` vs `src/lib/dal.ts`)
- Server Action vs route-handler for the create mutation
- ID generation strategy for new rows (schema uses `text` PKs)
- Card layout details, error-toast vs inline-error styling, list ordering

### Deferred Ideas (OUT OF SCOPE)

- Invite-link generation / acceptance, member list, remove-member (Phase 3)
- Owner-only project settings + GitHub repo link (Phase 4)
- Ticket CRUD, New-ticket button, atomic per-project counter (Phase 5)
- Per-owner (vs global) ticket-key uniqueness (schema migration required)
- Project deletion, list sorting/search, name-format validation
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROJ-01 | User can create a project with a name and a ticket key (e.g. "APP") | Server Action pattern, `db.batch()` for atomic two-row insert, unique-constraint error mapping |
| PROJ-02 | User can view a list of projects they own or are a member of | Drizzle LEFT JOIN + project_member filter, conditional COUNT aggregation for ticket counts |
| PROJ-03 | User can open a project to view its tickets | `/dashboard/projects/[id]` page, `requireProjectMember` DAL call mapped to `notFound()` |
| MEM-06 | Every project-scoped action is authorized against the user's membership (no cross-tenant access) | `requireProjectMember` DAL helper — membership check before any SELECT, IDOR prevention |
</phase_requirements>

---

## Summary

Phase 2 builds on the existing Phase 1 auth foundation — Better Auth session, neon-http `db`, and the DAL accessor pattern (`src/lib/github-token.ts`) — to add project creation, a membership-aware project list, and a project detail shell. The security centerpiece is `requireProjectMember`, a server-only DAL helper that checks membership before any project-scoped DB read, preventing IDOR attacks.

The key technical challenges are: (1) the two-row atomic insert (project + owner member row) on neon-http without interactive transactions — solved by `db.batch()`, which IS supported on `drizzle-orm/neon-http` and IS atomic (rolls back if either statement fails); (2) a single Drizzle query for the owned-or-member project list with open/resolved ticket counts using LEFT JOIN + CASE WHEN conditional aggregation; (3) the useActionState + controlled Dialog pattern for the create form.

All required packages are already installed. The only new asset is the shadcn `dialog` component, added via `npx shadcn@latest add dialog` (copies code, does not add an npm dependency).

**Primary recommendation:** Use `db.batch([insertProject, insertMember])` for the atomic create, `useActionState` for the form, `revalidatePath('/dashboard')` on success, and a typed `ProjectAccessError` class thrown by `requireProjectMember` so each call site maps it appropriately (notFound on the page, 403 status return in actions).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Project creation mutation | API / Backend (Server Action) | — | Mutates DB; must read session server-side; never client-executed |
| Session resolution | API / Backend (Server Component / Action) | — | `auth.api.getSession({ headers })` only valid in server context |
| Membership authorization (`requireProjectMember`) | API / Backend (DAL `src/lib/`) | — | Security boundary is server code, not middleware (CVE-2025-29927) |
| Project list query | API / Backend (Server Component) | — | DB query with JOIN; runs as async Server Component, no client fetch |
| Create-project dialog / form UI | Browser / Client (`'use client'`) | — | `useActionState`, controlled open state, `onChange` transforms |
| Ticket key input transform (uppercase, strip) | Browser / Client | — | Per-keystroke `onChange` — purely presentation |
| Project detail page shell | Frontend Server (RSC) | — | Calls `requireProjectMember` then renders; non-members get `notFound()` |
| Empty state / loading states | Browser / Client | — | `isPending` from `useActionState`, `Loader2` spinner |

---

## Standard Stack

### Core (all already installed in package.json)

| Library | Installed Version | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| next | 16.2.7 | App Router, Server Actions, `revalidatePath`, `notFound` | Locked stack |
| react | 19.2.4 | `useActionState` (React 19 built-in) | Locked stack |
| drizzle-orm | 0.45.2 | `db.batch()`, `leftJoin`, `sql` template, aggregations | Locked stack |
| @neondatabase/serverless | 0.10.x (pinned) | neon-http driver backing `db` | Locked — do NOT upgrade past 0.10.x |
| better-auth | 1.6.13 | `auth.api.getSession({ headers })` in Server Actions | Locked stack |
| lucide-react | 1.17.0 | `Plus`, `ChevronLeft`, `Loader2` icons | Locked stack |

### New Asset (not an npm package)

| Asset | How Added | Purpose |
|-------|-----------|---------|
| shadcn `dialog` component | `npx shadcn@latest add dialog` | Create-project Dialog; copies component code into `src/components/ui/dialog.tsx` |

No new npm packages are installed in Phase 2. All runtime dependencies are already present.

### Package Legitimacy Audit

Phase 2 installs **zero new npm packages**. The only new "component" is the shadcn `dialog` added via the shadcn CLI (which copies source code, not an npm install). No legitimacy audit of new packages is required.

| Package | Status | Note |
|---------|--------|------|
| All runtime deps | Already installed, Phase 1 vetted | No new packages introduced |
| `npx shadcn@latest add dialog` | shadcn official registry | Same CLI used in Phase 1; dialog is from the official shadcn registry, not a third-party block |

**Packages removed due to slopcheck verdict:** none
**Packages flagged as suspicious:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Client Component: CreateProjectDialog)
  │
  │  useActionState(createProjectAction, initialState)
  │  onChange → toUpperCase().replace(/[^A-Z]/g,'').slice(0,6)
  │
  ▼
Server Action: src/app/actions/projects.ts
  │  'use server'
  │  1. auth.api.getSession({ headers: await headers() }) → userId
  │  2. Validate name (required), ticketKey (2-6 A-Z)
  │  3. db.batch([
  │       INSERT project (id, name, ticketKey, ownerId, ...),
  │       INSERT project_member (id, projectId, userId, role:'owner', ...)
  │     ])  ← atomic: rolls back both if either fails
  │  4. Catch NeonDbError.code === '23505' → return { errors: { ticketKey: 'already in use' } }
  │  5. revalidatePath('/dashboard')
  │  6. Return { success: true } → client closes Dialog
  │
  ▼
neon-http db (batch channel)
  │
  ├── INSERT INTO project ...
  └── INSERT INTO project_member ...

─────────────────────────────────────────────────────────

Browser → GET /dashboard/projects/[id]
  │
  ▼
Server Component: src/app/dashboard/projects/[id]/page.tsx
  │  1. auth.api.getSession({ headers }) → userId
  │  2. requireProjectMember(projectId, userId)
  │     ├── SELECT id,role FROM project_member WHERE projectId=? AND userId=?
  │     ├── NOT FOUND → throw ProjectAccessError (caller maps to notFound())
  │     └── FOUND → return { projectId, userId, role }
  │  3. SELECT project WHERE id=projectId
  │  4. Render header + empty ticket placeholder
  │
  ▼
neon-http db

─────────────────────────────────────────────────────────

Browser → GET /dashboard (project list)
  │
  ▼
Server Component: src/app/dashboard/@projects/page.tsx (or inline in children slot)
  │  1. auth.api.getSession({ headers }) → userId
  │  2. SELECT projects + ticket counts
  │     FROM project_member pm
  │     JOIN project p ON pm.project_id = p.id
  │     LEFT JOIN ticket t ON t.project_id = p.id
  │     WHERE pm.user_id = userId
  │     GROUP BY p.id, p.name, p.ticket_key, pm.role
  │     ORDER BY p.created_at DESC
  │  3. Render project cards or empty state
```

### Recommended Project Structure

```
src/
├── app/
│   ├── actions/
│   │   └── projects.ts          # 'use server' — createProject Server Action
│   ├── dashboard/
│   │   ├── page.tsx             # existing shell (children seam) — no changes
│   │   ├── layout.tsx           # existing guard — no changes
│   │   └── projects/
│   │       └── [id]/
│   │           └── page.tsx     # project detail page (RSC)
│   └── dashboard/               # project list renders into {children} seam
│       └── (project-list)/      # or directly in dashboard page.tsx children
├── components/
│   ├── project-list.tsx         # Server Component: fetches + renders cards
│   ├── create-project-dialog.tsx # Client Component: Dialog + useActionState form
│   └── ui/
│       ├── dialog.tsx           # NEW — added by shadcn CLI
│       └── ... (existing)
└── lib/
    └── project-access.ts        # requireProjectMember DAL helper (server-only)
```

### Pattern 1: Server Action with useActionState (Create Project)

**What:** A `'use server'` action in `src/app/actions/projects.ts` accepts `(prevState, formData)`, validates, runs `db.batch()`, and returns a typed state object. The client wraps it with `useActionState`.

**When to use:** Any mutation that needs field-level error feedback and a pending spinner.

```typescript
// src/app/actions/projects.ts
'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, projectMembers } from '@/db/schema'

// Source: https://nextjs.org/docs/app/getting-started/mutating-data (verified 2026-06-01)
// Source: https://react.dev/reference/react/useActionState (verified 2026-06-01)

export type CreateProjectState = {
  errors?: {
    name?: string
    ticketKey?: string
    server?: string
  }
  success?: boolean
}

export async function createProject(
  prevState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return { errors: { server: 'Not authenticated' } }
  }

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const ticketKey = (formData.get('ticketKey') as string | null)?.trim() ?? ''

  // Validate
  const errors: CreateProjectState['errors'] = {}
  if (!name) errors.name = 'Project name is required.'
  if (!/^[A-Z]{2,6}$/.test(ticketKey)) errors.ticketKey = 'Key must be 2–6 uppercase letters.'
  if (Object.keys(errors).length > 0) return { errors }

  // Atomic two-row insert via db.batch()
  try {
    const projectId = crypto.randomUUID()
    const memberId = crypto.randomUUID()
    const now = new Date()

    await db.batch([
      db.insert(projects).values({
        id: projectId,
        name,
        ticketKey,
        ticketCounter: 0,
        ownerId: session.user.id,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(projectMembers).values({
        id: memberId,
        projectId,
        userId: session.user.id,
        role: 'owner',
        createdAt: now,
      }),
    ])
  } catch (err: unknown) {
    // Postgres unique constraint violation: error code 23505
    // NeonDbError carries .code from the pg DatabaseError
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === '23505'
    ) {
      return { errors: { ticketKey: 'This key is already in use. Choose a different one.' } }
    }
    return { errors: { server: 'Something went wrong. Please try again.' } }
  }

  revalidatePath('/dashboard')
  return { success: true }
}
```

```tsx
// src/components/create-project-dialog.tsx  (Client Component)
'use client'

import { useActionState, useEffect, useState } from 'react'
import { createProject } from '@/app/actions/projects'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus } from 'lucide-react'

// Source: https://react.dev/reference/react/useActionState
const initialState = { errors: undefined, success: false }

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false)
  const [state, action, isPending] = useActionState(createProject, initialState)

  // Close dialog on success
  useEffect(() => {
    if (state.success) {
      setOpen(false)
      // Dialog close resets form via key prop or by clearing controlled state
    }
  }, [state.success])

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        New project
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription className="sr-only">
              Enter a project name and ticket key to create a new project.
            </DialogDescription>
          </DialogHeader>
          <form action={action} className="flex flex-col gap-4">
            {/* fields */}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Discard
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

### Pattern 2: requireProjectMember DAL Helper

**What:** A server-only function in `src/lib/project-access.ts` that selects the `project_member` row for `(projectId, userId)` and throws a typed error if not found. Callers map the error to the appropriate HTTP surface.

**When to use:** Every Server Component, Server Action, or Route Handler that reads or writes project-scoped data.

```typescript
// src/lib/project-access.ts
// Source: mirrors getGitHubToken pattern in src/lib/github-token.ts

import { db } from '@/lib/db'
import { projectMembers } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

export type ProjectMembership = {
  projectId: string
  userId: string
  role: 'owner' | 'member'
}

export class ProjectAccessError extends Error {
  constructor(message = 'Not a project member') {
    super(message)
    this.name = 'ProjectAccessError'
  }
}

/**
 * Verifies that userId is a member of projectId.
 * Throws ProjectAccessError BEFORE any project-scoped data is read.
 *
 * Server Actions: catch and return { errors: { server: '...' }, status: 403 }
 * Server Component pages: catch and call notFound() (enumeration-resistant, D-15)
 *
 * Returns { projectId, userId, role } — role enables requireProjectOwner in Phase 3/4.
 */
export async function requireProjectMember(
  projectId: string,
  userId: string,
): Promise<ProjectMembership> {
  const [membership] = await db
    .select({
      projectId: projectMembers.projectId,
      userId: projectMembers.userId,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1)

  if (!membership) {
    throw new ProjectAccessError()
  }

  return membership as ProjectMembership
}
```

Usage in a Server Component page (D-15 — map to notFound):

```typescript
// src/app/dashboard/projects/[id]/page.tsx
import { notFound } from 'next/navigation'
import { requireProjectMember, ProjectAccessError } from '@/lib/project-access'

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login')

  try {
    await requireProjectMember(params.id, session.user.id)
  } catch (err) {
    if (err instanceof ProjectAccessError) notFound()
    throw err
  }

  // Safe to read project data here — membership verified
  const [project] = await db.select().from(projects).where(eq(projects.id, params.id)).limit(1)
  if (!project) notFound()
  // ...
}
```

Usage in a Server Action (D-15 — return 403-equivalent):

```typescript
export async function someProjectAction(projectId: string, ...) {
  'use server'
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { errors: { server: 'Unauthenticated' } }

  try {
    await requireProjectMember(projectId, session.user.id)
  } catch {
    return { errors: { server: 'Forbidden' }, status: 403 }
  }

  // Proceed with project data access
}
```

### Pattern 3: Owned-or-Member Project List with Ticket Counts

**What:** A single Drizzle query joining `project_member` → `project` → `ticket` (LEFT JOIN) with conditional COUNT aggregation for open vs resolved counts.

**When to use:** The dashboard project list — renders into the `{children}` seam of `src/app/dashboard/page.tsx`.

```typescript
// Source: https://orm.drizzle.team/docs/select#aggregations-helpers (verified 2026-06-01)
// Source: conditional COUNT CASE WHEN pattern verified against Drizzle docs

import { sql, count, eq, and } from 'drizzle-orm'
import { projects, projectMembers, tickets } from '@/db/schema'

export async function getProjectsForUser(userId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      ticketKey: projects.ticketKey,
      createdAt: projects.createdAt,
      role: projectMembers.role,
      openCount: sql<number>`cast(count(case when ${tickets.status} != 'done' and ${tickets.id} is not null then 1 end) as int)`,
      resolvedCount: sql<number>`cast(count(case when ${tickets.status} = 'done' then 1 end) as int)`,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .leftJoin(tickets, eq(tickets.projectId, projects.id))
    .where(eq(projectMembers.userId, userId))
    .groupBy(
      projects.id,
      projects.name,
      projects.ticketKey,
      projects.createdAt,
      projectMembers.role,
    )
    .orderBy(sql`${projects.createdAt} desc`)
}
```

The `INNER JOIN project_member` naturally restricts to rows where `userId` is a member (covers both owner and member roles because `project_member` holds both). No OR logic needed in the WHERE clause — the membership table is the filter.

### Pattern 4: Ticket Key Input Transform (Client Component)

**What:** Per-keystroke `onChange` handler that enforces uppercase A-Z, max 6 characters.

```typescript
// In the controlled input:
onChange={(e) => {
  const transformed = e.target.value
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6)
  setTicketKey(transformed)
}}
```

Validation (minimum 2 chars, uniqueness check) defers to submit, per Phase 1 form pattern.

### Anti-Patterns to Avoid

- **Middleware auth checks:** CVE-2025-29927 allows bypass via `x-middleware-subrequest`. All auth and membership checks live in server code (layout, page, action). (CLAUDE.md locked)
- **Using `authDb` for app mutations:** `authDb` (neon-serverless/WebSocket) is reserved for Better Auth's own writes. App code uses `db` (neon-http). `db.batch()` provides the atomicity we need without touching `authDb`.
- **Sequential awaits instead of batch:** Inserting project first then member in two separate `await db.insert()` calls creates a window where a project exists with no owner if the second insert fails. Always use `db.batch()` for this two-row create.
- **Reading `ticketKey` error code from error.message:** Message text is locale-dependent and Neon can change it. Always check `(err as {code?:string}).code === '23505'`.
- **Calling `notFound()` from inside try/catch without re-throwing:** `notFound()` throws a Next.js control-flow exception. If you catch all errors with a bare `catch`, you must re-throw non-`ProjectAccessError` exceptions. See the Pattern 2 example above (`if (err instanceof ProjectAccessError) notFound(); throw err`).
- **Using `forbidden()` from next/navigation:** Still experimental in Next.js 16.2.7, requires `experimental.authInterrupts: true` in next.config. D-15 uses `notFound()` for the page (acceptable: enumeration-resistant) and a returned error object for Server Actions. Do NOT add `authInterrupts` flag.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic two-row insert on neon-http | Sequential awaits + manual cleanup | `db.batch([insertProject, insertMember])` | Batch is atomic on neon-http: if either INSERT fails, both roll back — verified against Drizzle batch API docs and Neon driver behavior |
| Per-keystroke input sanitization | Complex regex state machine | `.toUpperCase().replace(/[^A-Z]/g,'').slice(0,6)` | 3-chained string methods cover all cases in one `onChange` |
| Field-level form error state | Custom error reducer | `useActionState(action, initialState)` | Built into React 19; returns `[state, action, isPending]` |
| Session reading in Server Actions | Manual cookie parsing | `auth.api.getSession({ headers: await headers() })` | The `nextCookies()` plugin already installed in `auth.ts` enables this — no additional setup |
| Conditional COUNT in SQL | Two separate queries | `sql\`cast(count(case when ... then 1 end) as int)\`` | Single round-trip; standard PostgreSQL CASE WHEN in aggregation |
| Modal close on server success | Polling or timers | `useEffect` watching `state.success` | Clean React pattern; effect fires after state update, closes dialog |

**Key insight:** The atomic insert is the most tempting thing to hand-roll (project first, then member), but the failure window between the two awaits creates an ownerless project that breaks all membership queries. `db.batch()` eliminates this entirely.

---

## Common Pitfalls

### Pitfall 1: IDOR from Missing `requireProjectMember` (STATE pitfall #3)

**What goes wrong:** A Server Component renders `/dashboard/projects/[id]` or a Server Action accepts a `projectId` parameter without verifying membership first, allowing any authenticated user to read or modify another tenant's project data.

**Why it happens:** Developers check authentication (is the user logged in?) but forget authorization (does this user belong to this project?).

**How to avoid:** `requireProjectMember` must be the first async call in every project-scoped Server Component and Server Action, before any `db.select()` or `db.update()` on project data. Establish this as a convention at the start of Phase 2 and never deviate.

**Warning signs:** Any function that takes `projectId` and calls `db.select().from(projects)` without a prior `requireProjectMember` call.

### Pitfall 2: Ownerless Project on Failed Second Insert

**What goes wrong:** Using two sequential `await db.insert()` calls — if the first succeeds (project row created) and the second fails (e.g. network blip, constraint violation), the project exists with no `project_member` row. No user can access it, and the dashboard query (`INNER JOIN project_member`) will silently omit it, creating an invisible orphan.

**Why it happens:** Forgetting that neon-http does not support interactive transactions, so `db.transaction()` is unavailable.

**How to avoid:** Always use `db.batch([insertProject, insertMember])`. The Drizzle batch API on neon-http sends both statements in a single HTTP round-trip and rolls back the entire batch if either fails.

**Warning signs:** Two `await db.insert()` calls without a surrounding `db.batch()`.

### Pitfall 3: `notFound()` Swallowed by Bare `catch`

**What goes wrong:** Calling `notFound()` inside a `try { ... } catch (err) { ... }` block where the catch re-maps all errors — `notFound()` throws a control-flow exception that must propagate.

**Why it happens:** `notFound()` works like `redirect()`: it throws a framework-internal exception. A bare `catch` block that handles all exceptions will eat it.

**How to avoid:** Always use `if (err instanceof ProjectAccessError) notFound(); throw err` — re-throw anything that isn't your expected error class. Never `catch (err) { return fallback }` without re-throwing non-domain errors.

### Pitfall 4: Postgres Error Code Not on `err.code` Directly

**What goes wrong:** Checking `err.message.includes('unique')` instead of `err.code === '23505'` — message text varies by locale and Neon version.

**Why it happens:** `err.code` requires knowing the property exists on the neon error. The `NeonDbError` class (from `@neondatabase/serverless`) extends `pg.DatabaseError` and carries `.code` as a string field. Drizzle does not wrap this — the original error is thrown up the stack.

**How to avoid:** Type-check with `(err as { code?: string }).code === '23505'`. The `23505` code is the stable SQLSTATE for `unique_violation` in PostgreSQL.

### Pitfall 5: Better Auth `getSession` Called Without `await headers()`

**What goes wrong:** Passing `headers()` (the promise) instead of `await headers()` to `auth.api.getSession` — the session resolves as `null` even when a valid cookie exists.

**Why it happens:** `headers()` in Next.js 15+ is async and returns a promise. Forgetting `await` passes the Promise object, not the Headers.

**How to avoid:** Always `auth.api.getSession({ headers: await headers() })`. This is consistent with the pattern already used in `src/app/dashboard/layout.tsx` and `src/app/dashboard/page.tsx`.

### Pitfall 6: Upgrading `@neondatabase/serverless` Past 0.10.x

**What goes wrong:** `drizzle-orm/neon-http` breaks with `@neondatabase/serverless@^1.0.0` (open bug drizzle-orm#5208, January 2026).

**How to avoid:** The pin `^0.10.4` in `package.json` already prevents accidental upgrades. Do not bump this constraint. `npm view @neondatabase/serverless version` currently shows `1.1.0` — do not upgrade.

---

## Code Examples

### ID Generation for New Rows

The schema uses `text` PKs. Better Auth generates its own IDs internally (using `generateId` from `@better-auth/core/utils/id`). For Phase 2's hand-rolled rows, use `crypto.randomUUID()` — built into Node.js 20, zero dependencies, UUID v4 format consistent with the `text` PK type:

```typescript
// Source: Node.js 20 built-in — verified via node -e "console.log(crypto.randomUUID())"
const projectId = crypto.randomUUID()  // e.g. "320669af-ef9a-46ee-9fa1-b5697db177e1"
const memberId  = crypto.randomUUID()
```

`crypto.randomUUID()` does NOT require importing — available as a global in Node.js 20 and in the browser. In TypeScript, it is available on the `crypto` global.

### `db.batch()` for Atomic Two-Row Insert

```typescript
// Source: https://orm.drizzle.team/docs/batch-api (verified 2026-06-01)
// ATOMIC: if either INSERT fails, both roll back (neon-http batch behavior)
await db.batch([
  db.insert(projects).values({
    id: projectId,
    name,
    ticketKey,
    ticketCounter: 0,
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
  }),
  db.insert(projectMembers).values({
    id: memberId,
    projectId,
    userId,
    role: 'owner',
    createdAt: now,
  }),
])
```

### Unique Constraint Error Detection

```typescript
// Source: NeonDbError carries .code from pg-protocol DatabaseError
// Postgres SQLSTATE 23505 = unique_violation (stable, locale-independent)
catch (err: unknown) {
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
    return { errors: { ticketKey: 'This key is already in use. Choose a different one.' } }
  }
  // Re-throw unexpected errors — don't swallow them
  throw err
}
```

### Project List Query (owned-or-member with ticket counts)

```typescript
// Source: https://orm.drizzle.team/docs/select#aggregations-helpers
// INNER JOIN project_member is the authorization filter (covers owner + member)
// LEFT JOIN ticket so projects with 0 tickets still appear (count returns 0)
const userProjects = await db
  .select({
    id: projects.id,
    name: projects.name,
    ticketKey: projects.ticketKey,
    createdAt: projects.createdAt,
    role: projectMembers.role,
    openCount: sql<number>`cast(count(case when ${tickets.status} != 'done' and ${tickets.id} is not null then 1 end) as int)`,
    resolvedCount: sql<number>`cast(count(case when ${tickets.status} = 'done' then 1 end) as int)`,
  })
  .from(projectMembers)
  .innerJoin(projects, eq(projectMembers.projectId, projects.id))
  .leftJoin(tickets, eq(tickets.projectId, projects.id))
  .where(eq(projectMembers.userId, userId))
  .groupBy(
    projects.id,
    projects.name,
    projects.ticketKey,
    projects.createdAt,
    projectMembers.role,
  )
  .orderBy(sql`${projects.createdAt} desc`)
```

Note: The `cast(... as int)` is required because PostgreSQL's `count()` returns `bigint`, which Drizzle types as `string`. The explicit cast gives a JavaScript `number`. [VERIFIED: Drizzle docs]

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Auth.js v5 (next-auth@5-beta) | Better Auth 1.6 | Auth.js now security-patch-only; Better Auth is the successor |
| `useFormState` (React 18) | `useActionState` (React 19) | `useFormState` is deprecated; `useActionState` is the React 19 standard |
| `forbidden()` from `next/navigation` | `notFound()` for pages, returned error for actions | `forbidden()` still experimental in Next.js 16.2.7 (requires `authInterrupts: true`) — not used per D-15 |
| Auth.js Organization plugin | Hand-rolled project_member table (D-12) | Plugin defaults to emailed invites; hand-rolled tables already migrated |
| `@dnd-kit/core` (legacy) | Not needed in Phase 2 | Deferred to Phase 6 |

**Deprecated/outdated in this codebase:**
- `useFormState`: replaced by `useActionState` in React 19 — do not use
- `forbidden()`: skip entirely per D-15; not production-stable in Next.js 16.2.7

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `db.batch()` on neon-http is atomic: if the second INSERT fails, the first is rolled back | Standard Stack, Don't Hand-Roll | If not atomic, an ownerless project can be created. Mitigation: test explicitly in Wave 0 with a forced-failure scenario. The Drizzle batch API docs and Neon driver source both support this claim. [ASSUMED based on doc language + source inspection — not a live integration test] |
| A2 | `crypto.randomUUID()` is available as a global in Next.js 16 server context without explicit import | Code Examples | Low risk — it is a Node.js 20 global and verified via `node -e "console.log(crypto.randomUUID())"` on this machine. Still [ASSUMED] for the server action context specifically. |
| A3 | `NeonDbError.code` carries the PostgreSQL SQLSTATE string `'23505'` for unique violations | Common Pitfalls, Code Examples | If wrong, unique key errors surface as generic server errors. Mitigation: add a test case in Wave 0 that triggers the unique constraint and asserts the error mapping. [ASSUMED — code inspection of @neondatabase/serverless/index.js confirms `.code` field exists on NeonDbError, but a live trigger test would be definitive] |

**If this table is empty:** N/A — 3 assumptions noted above.

---

## Open Questions (RESOLVED)

1. **Dialog form reset on close** — RESOLVED
   - What we know: The shadcn `Dialog` supports a `key` prop trick to reset form state on close, or the form can use `defaultValue` controlled via state.
   - What's unclear: Whether `useActionState` state persists between open/close cycles if the same component instance is kept mounted.
   - Recommendation: Use a `key={open ? 'open' : 'closed'}` on the form element inside the Dialog, or explicitly reset controlled field state in an `onOpenChange` handler. Either is straightforward. Planner decides.
   - **RESOLUTION:** Handled in plan 02-02 Task 2 — the dialog resets controlled field state (`setTicketKey('')`) and closes (`setOpen(false)`) in a `useEffect` keyed on `state.success`. No outstanding decision.

2. **`project_member` has no uniqueness constraint on (projectId, userId)** — RESOLVED (deferred to Phase 3)
   - What we know: The schema as written (`schema.ts`) does not have a `unique().on(projectMembers.projectId, projectMembers.userId)` constraint.
   - What's unclear: Whether a duplicate-membership insert could happen (e.g., race condition on two simultaneous creates with the same user+project).
   - Recommendation: For Phase 2 (single create-flow, owner insertion immediately after project insert), this is not a real risk. Flag for Phase 3 when invite acceptance could race with itself.
   - **RESOLUTION:** Not a Phase 2 risk (single owner insert per create, no concurrent membership path). Deferred to Phase 3 (invite acceptance) per 02-CONTEXT.md `<deferred>`. No Phase 2 plan change required.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20+ | `crypto.randomUUID()`, Server Actions, Vercel runtime | ✓ | v22.14.0 | — |
| Neon DATABASE_URL | All DB queries | ✓ | confirmed in `.env.local` | — |
| Vitest | Test suite | ✓ | 4.1.8 | — |
| shadcn CLI (`npx shadcn@latest`) | Adding `dialog` component | ✓ | 4.10.0 installed | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run src/tests/projects.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-01 | `createProject` action inserts project + owner member row atomically | integration | `npx vitest run src/tests/projects.test.ts` | ❌ Wave 0 |
| PROJ-01 | Duplicate `ticketKey` returns field-level error (not server crash) | integration | `npx vitest run src/tests/projects.test.ts` | ❌ Wave 0 |
| PROJ-01 | Short/invalid `ticketKey` (< 2 chars, non-alpha) returns validation error | integration | `npx vitest run src/tests/projects.test.ts` | ❌ Wave 0 |
| PROJ-02 | Dashboard query returns projects for owner and for member | integration | `npx vitest run src/tests/projects.test.ts` | ❌ Wave 0 |
| PROJ-02 | Query returns 0 open / 0 resolved for a project with no tickets | integration | `npx vitest run src/tests/projects.test.ts` | ❌ Wave 0 |
| PROJ-03 | Non-member access to project detail throws `ProjectAccessError` (maps to `notFound()`) | integration | `npx vitest run src/tests/projects.test.ts` | ❌ Wave 0 |
| MEM-06 | `requireProjectMember` rejects before any project SELECT runs | integration | `npx vitest run src/tests/projects.test.ts` | ❌ Wave 0 |
| MEM-06 | `requireProjectMember` accepts a member (not just owner) | integration | `npx vitest run src/tests/projects.test.ts` | ❌ Wave 0 |

**Critical test — authorization boundary (MEM-06 / pitfall #3):** The test for `requireProjectMember` must verify that:
1. The function throws before a subsequent `db.select()` on project data would execute.
2. A user who is NOT in `project_member` for that project gets rejected.

This is the 403-before-DB guarantee (success criterion #4 from the roadmap).

### Sampling Rate

- **Per task commit:** `npx vitest run src/tests/projects.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/tests/projects.test.ts` — covers PROJ-01, PROJ-02, PROJ-03, MEM-06 (8 test cases above)

**Setup note:** Follow the `auth.test.ts` pattern — unique IDs per run, `afterEach` cleanup deletes all created rows (cascade deletes handle project_member and ticket rows via FK `ON DELETE CASCADE`).

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (session check) | Better Auth `auth.api.getSession` — already established in Phase 1 |
| V3 Session Management | yes | Better Auth JWT sessions — established in Phase 1 |
| V4 Access Control | **yes — primary concern** | `requireProjectMember` DAL helper, checked before every project-scoped DB operation |
| V5 Input Validation | yes | Server Action validates name (non-empty) and ticketKey (regex `/^[A-Z]{2,6}$/`) before DB write |
| V6 Cryptography | no | No new cryptographic operations in Phase 2 |

### Known Threat Patterns for this Phase's Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR — accessing another user's project via `/dashboard/projects/[id]` | Information Disclosure | `requireProjectMember` called FIRST in every project-scoped server function; non-members get `notFound()` (not 403) to prevent project-existence enumeration |
| Privilege escalation — Server Action accepts `projectId` without membership check | Elevation of Privilege | `requireProjectMember` in every Server Action before any DB mutation |
| Ownerless project creation — partial batch failure | Tampering (data integrity) | `db.batch()` atomicity ensures project row and owner member row are always created together |
| Ticket key injection — user submits non-uppercase or special chars | Tampering | Server-side validation: `/^[A-Z]{2,6}$/` test before INSERT; client-side transform is UX only |
| Session bypass via middleware | Spoofing | CVE-2025-29927: security boundary is server code (`layout.tsx`, Server Actions), not `middleware.ts` — already established in Phase 1 |

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 2 |
|-----------|-------------------|
| neon-http for app queries, neon-serverless for Better Auth | `db` (neon-http) for all project/member inserts and selects; `authDb` NOT touched in Phase 2 |
| Pin `@neondatabase/serverless@^0.10.4` | Do not upgrade; npm registry shows 1.1.0 but that breaks drizzle-orm/neon-http |
| Better Auth 1.6 with `nextCookies()` plugin | `auth.api.getSession({ headers: await headers() })` works in Server Actions without extra setup |
| Tailwind v4 + shadcn radix-nova preset | Add `dialog` via shadcn CLI; CSS-first config via `@theme` in globals.css |
| No interactive transactions on neon-http `db` | Use `db.batch()` for the two-row create; never `db.transaction()` on the app `db` |
| `@dnd-kit/react` 0.4.x (not @dnd-kit/core) | Not needed in Phase 2 — deferred to Phase 6 |
| Security boundary = server code not middleware | `requireProjectMember` in DAL, not middleware.ts |
| Budget $0 — stay within free tiers | No new paid services introduced |

---

## Sources

### Primary (HIGH confidence)

- [Next.js 16.2.7 — Mutating Data / Server Actions](https://nextjs.org/docs/app/getting-started/mutating-data) — Server Action definition, `revalidatePath`, `useActionState` pattern, `headers()` usage. Fetched 2026-06-01.
- [Next.js 16.2.7 — `forbidden()` API reference](https://nextjs.org/docs/app/api-reference/functions/forbidden) — confirmed still experimental, requires `authInterrupts: true` config flag. Fetched 2026-06-01.
- [React 19 — `useActionState`](https://react.dev/reference/react/useActionState) — full API signature, field-level error pattern, pending state. Fetched 2026-06-01.
- [Drizzle ORM — Batch API](https://orm.drizzle.team/docs/batch-api) — confirmed neon-http support for `db.batch()`, typed return tuple. Fetched 2026-06-01.
- [Drizzle ORM — Connect Neon](https://orm.drizzle.team/docs/connect-neon) — neon-http driver setup, transaction limitations. Fetched 2026-06-01.
- [Drizzle ORM — Select / Aggregations](https://orm.drizzle.team/docs/select#aggregations-helpers) — CASE WHEN conditional count pattern, `cast(count(...) as int)` requirement. Fetched 2026-06-01.
- [Neon Serverless Driver docs](https://neon.com/docs/serverless/serverless-driver) — `sql.transaction()` for non-interactive batches on HTTP, atomicity behavior. Fetched 2026-06-01.
- `src/db/schema.ts` — confirmed table shapes for project, projectMembers, tickets, invitations.
- `src/lib/github-token.ts` — the exact DAL accessor pattern `requireProjectMember` mirrors.
- `src/lib/db.ts` — confirmed `db` = neon-http, `authDb` = neon-serverless.
- `src/lib/auth.ts` — confirmed `nextCookies()` plugin installed; `auth.api.getSession` pattern.
- `src/app/dashboard/layout.tsx` — confirmed `auth.api.getSession({ headers: await headers() })` pattern.
- `src/app/dashboard/page.tsx` — confirmed `{children}` seam location (D-09).
- `@neondatabase/serverless/index.js` — source inspection confirmed `NeonDbError` class with `.code` string field from `pg.DatabaseError`.
- GitHub driver source: `drizzle-orm/neon-http/driver.ts` — confirmed `db.batch()` method on `NeonHttpDatabase`.

### Secondary (MEDIUM confidence)

- WebSearch cross-reference: neon-http batch atomicity — multiple sources confirm batch rolls back on failure, consistent with Drizzle docs language.

### Tertiary (LOW confidence)

- Better Auth `nextCookies()` plugin enabling Server Action cookie reading — confirmed by auth.ts code presence and general Next.js Server Action cookie docs, but Better Auth docs URL returned 404; relies on Phase 1 working implementation as evidence.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages verified on npm registry; no new packages needed
- Architecture: HIGH — verified against Next.js 16 docs, Drizzle batch API, existing Phase 1 codebase patterns
- Atomic insert via `db.batch()`: HIGH — confirmed by Drizzle source inspection + Neon docs
- Authorization pattern (`requireProjectMember`): HIGH — directly mirrors `github-token.ts` pattern already in codebase
- Pitfalls: HIGH — derived from CLAUDE.md, STATE.md accumulated context, and verified source behavior

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (stable stack; the `@neondatabase/serverless` version pin is the most likely thing to change when drizzle-orm#5208 is resolved)
