# Phase 2: Projects + Authorization Layer - Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 7 new/modified files
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/project-access.ts` | utility/DAL | request-response | `src/lib/github-token.ts` | exact |
| `src/app/actions/projects.ts` | service/action | CRUD | `src/app/dashboard/layout.tsx` (session pattern) + `src/app/(auth)/login/login-form.tsx` (state shape) | role-match |
| `src/components/project-list.tsx` | component (server) | request-response | `src/app/dashboard/page.tsx` | exact |
| `src/components/create-project-dialog.tsx` | component (client) | request-response | `src/app/(auth)/login/login-form.tsx` | role-match |
| `src/app/dashboard/page.tsx` | component (server) | request-response | existing file — children seam wired | modify (additive) |
| `src/app/dashboard/projects/[id]/page.tsx` | component (server) | request-response | `src/app/dashboard/layout.tsx` | exact |
| `src/tests/projects.test.ts` | test | CRUD | `src/tests/auth.test.ts` + `src/tests/db.test.ts` | exact |

---

## Pattern Assignments

### `src/lib/project-access.ts` (utility/DAL, request-response)

**Analog:** `src/lib/github-token.ts`

This is the closest possible match — same file role, same data flow, same `userId` arg convention, same neon-http `db`, same minimal-column select, same server-only constraint.

**Imports pattern** (analog lines 22-25):
```typescript
import { db } from '@/lib/db';
import { accounts } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
```

**Delta for new file:** swap `accounts` for `projectMembers`, add `ProjectAccessError` class before the exported function, return typed membership object instead of a scalar.

**Core pattern — minimal-column select + null guard** (analog lines 33-41):
```typescript
export async function getGitHubToken(userId: string): Promise<string | null> {
  const [account] = await db
    .select({ accessToken: accounts.accessToken })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'github')))
    .limit(1);

  return account?.accessToken ?? null;
}
```

**Delta:** Instead of returning `null` on miss, throw `ProjectAccessError`. Use `and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))` as the WHERE. Select `{ projectId, userId, role }` — the minimum columns needed, matching the DAL convention of never over-fetching.

**Error class pattern to add** (no analog exists — first typed domain error; use standard ES class pattern):
```typescript
export class ProjectAccessError extends Error {
  constructor(message = 'Not a project member') {
    super(message);
    this.name = 'ProjectAccessError';
  }
}
```

**Schema columns available** (from `src/db/schema.ts` lines 101-111):
```typescript
export const projectMembers = pgTable('project_member', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'member'] }).notNull(),
  createdAt: timestamp('created_at').notNull(),
});
```

---

### `src/app/actions/projects.ts` (service/action, CRUD)

**Analog (session pattern):** `src/app/dashboard/layout.tsx` (lines 21-28) and `src/app/dashboard/page.tsx` (lines 38-39)

**Analog (state/error shape):** `src/app/(auth)/login/login-form.tsx` (lines 36-50) — field-level error state structure

**CRITICAL DELTA from Phase 1 form pattern:** Login/signup used `authClient` (browser-side Better Auth client). The create-project mutation is a `'use server'` Server Action. The session is obtained via `auth.api.getSession({ headers: await headers() })` on the server — NOT via `authClient`. This is the same pattern as `layout.tsx` and `page.tsx`, not the client form.

**Session resolution pattern** (analog: `src/app/dashboard/page.tsx` lines 38-39):
```typescript
const session = await auth.api.getSession({ headers: await headers() });
const user = session?.user;
```

**Imports pattern** (derived from analogs):
```typescript
'use server'

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, projectMembers } from '@/db/schema';
```

**State type pattern** (modeled on login-form field-error convention, lines 36-50):
```typescript
export type CreateProjectState = {
  errors?: {
    name?: string;
    ticketKey?: string;
    server?: string;
  };
  success?: boolean;
};
```

**Atomic two-row insert — `db.batch()` pattern** (no existing analog — new to project; from RESEARCH.md):
```typescript
const projectId = crypto.randomUUID();  // Node 20 global — no import needed
const memberId  = crypto.randomUUID();
const now = new Date();

await db.batch([
  db.insert(projects).values({
    id: projectId, name, ticketKey, ticketCounter: 0,
    ownerId: session.user.id, createdAt: now, updatedAt: now,
  }),
  db.insert(projectMembers).values({
    id: memberId, projectId, userId: session.user.id,
    role: 'owner', createdAt: now,
  }),
]);
```

**Unique-constraint error detection pattern** (no existing analog — new to project):
```typescript
catch (err: unknown) {
  if (
    typeof err === 'object' && err !== null &&
    (err as { code?: string }).code === '23505'
  ) {
    return { errors: { ticketKey: 'This key is already in use. Choose a different one.' } };
  }
  throw err;  // re-throw unexpected errors — never swallow
}
```

**Revalidation pattern** (no existing analog in codebase yet; standard Next.js 15):
```typescript
revalidatePath('/dashboard');
return { success: true };
```

---

### `src/components/project-list.tsx` (component/server, request-response)

**Analog:** `src/app/dashboard/page.tsx`

This is a Server Component that reads session + queries db, exactly like `page.tsx`. The primary difference: it runs the owned-or-member project list query rather than the `isGitHubConnected` call.

**Session + conditional render pattern** (analog lines 38-44):
```typescript
const session = await auth.api.getSession({ headers: await headers() });
const user = session?.user;
// ... conditional on user
const githubConnected = user ? await isGitHubConnected(user.id) : false;
```

**JSX structure pattern** (analog lines 46-79) — the `page.tsx` renders `<div className="min-h-screen bg-background">` with a `<main className="container mx-auto max-w-4xl px-6 py-8">`. The project list renders inside that `<main>` via the `{children}` seam, so `project-list.tsx` is the `children` — it should NOT wrap itself in a full-page layout, only output the section content.

**Badge usage pattern** (analog lines 62-71):
```typescript
<Badge variant="secondary">
  <CheckCircle />
  GitHub connected
</Badge>
// vs
<Badge variant="outline">
  <CircleOff />
  GitHub not connected
</Badge>
```

**Delta for project-list:** role badges follow same variant convention: owner → `variant="secondary"`, member → `variant="outline"`. Ticket-key badge → `variant="secondary"` with `className="font-mono"`.

**Card-as-link pattern** (no existing analog; new to project — use Next.js `<Link>` wrapping the shadcn `Card`):
```typescript
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

<Link href={`/dashboard/projects/${project.id}`}>
  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
    <CardContent className="p-4">
      {/* ... */}
    </CardContent>
  </Card>
</Link>
```

**Project list query** (no existing analog in codebase — from RESEARCH.md Pattern 3; uses `sql`, `eq` from drizzle-orm):
```typescript
import { sql, eq } from 'drizzle-orm';
import { projects, projectMembers, tickets } from '@/db/schema';

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
  .groupBy(projects.id, projects.name, projects.ticketKey, projects.createdAt, projectMembers.role)
  .orderBy(sql`${projects.createdAt} desc`);
```

Note: `cast(... as int)` is required — PostgreSQL `count()` returns `bigint`, which Drizzle types as `string` without the cast.

---

### `src/components/create-project-dialog.tsx` (component/client, request-response)

**Analog:** `src/app/(auth)/login/login-form.tsx`

This is the closest form analog in the codebase. The key differences are: (1) uses `useActionState` instead of manual `useState` + handler; (2) wraps fields in a shadcn `Dialog` rather than a `Card`; (3) the form action is a Server Action reference, not an `authClient` call.

**`'use client'` + imports pattern** (analog lines 1-33):
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, ... } from '@/components/ui/card';
```

**Delta imports for dialog:** replace `Card` imports with `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter` from `@/components/ui/dialog`. Add `useActionState, useEffect` from `react`. Add `Plus` from `lucide-react`. Remove `authClient` and `useRouter` — no client-side auth call, no navigation.

**Field-level error display pattern** (analog lines 120-138):
```typescript
<Input
  id="email"
  type="email"
  value={email}
  aria-invalid={emailError ? true : undefined}
  aria-describedby={emailError ? 'email-error' : undefined}
  onChange={(e) => {
    setEmail(e.target.value);
    if (emailError) setEmailError(null);
  }}
/>
{emailError && (
  <p id="email-error" className="text-destructive text-sm">
    {emailError}
  </p>
)}
```

**Delta:** errors come from `state.errors.ticketKey` / `state.errors.name` returned by the Server Action, not from local `useState`. The `onChange` clear-on-type pattern still applies but clears via controlled field state.

**Loading/pending button pattern** (analog lines 163-167):
```typescript
<Button type="submit" className="w-full" disabled={loading}>
  {loading && <Loader2 className="animate-spin" />}
  {loading ? 'Signing in…' : 'Sign in'}
</Button>
```

**Delta:** `loading` → `isPending` from `useActionState`. Text: "Creating…" / "Create project".

**`useActionState` pattern** (NOT in any existing file — new to project; replaces the manual `useState + handler` pattern in login-form):
```typescript
import { useActionState, useEffect, useState } from 'react';
import { createProject, type CreateProjectState } from '@/app/actions/projects';

const initialState: CreateProjectState = {};

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, isPending] = useActionState(createProject, initialState);

  // Close dialog on server-confirmed success
  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

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
            {/* fields ... */}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Discard
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</>
                  : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**Ticket key `onChange` transform pattern** (no existing analog — new):
```typescript
onChange={(e) => {
  const transformed = e.target.value
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6);
  setTicketKey(transformed);
}}
```

---

### `src/app/dashboard/page.tsx` (server component — additive modification)

**Analog:** existing file — `src/app/dashboard/page.tsx` lines 75-77

This file is NOT rewritten. The change is additive: import `CreateProjectDialog` and `ProjectList` (or equivalent) and drop them into the `{children}` seam already established.

**Existing seam** (lines 75-77):
```typescript
{/* Phase 2 seam: the project list renders here without touching the shell. */}
{children}
```

**Delta:** Replace or augment `{children}` — or this component may pass the project list as a child slot. The planner decides whether to inline `<ProjectList>` here or keep `{children}` as-is and add a `default.tsx` in a route group. Either way, `CreateProjectDialog` must be rendered in this component (it holds the button state) — most likely alongside the project list section heading.

**Existing imports to extend** (lines 16-22):
```typescript
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { CheckCircle, CircleOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LogoutButton } from '@/components/logout-button';
import { isGitHubConnected } from '@/lib/github-token';
```

---

### `src/app/dashboard/projects/[id]/page.tsx` (component/server, request-response)

**Analog:** `src/app/dashboard/layout.tsx`

The layout is the exact pattern to copy: server component, reads session, guards with a redirect (here: `notFound()` instead of `redirect()`), renders children. The critical addition is the `requireProjectMember` call between session check and data render.

**Session guard + redirect pattern** (analog lines 21-29):
```typescript
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  return <>{children}</>;
}
```

**Delta — add `requireProjectMember` + `notFound()` mapping:**
```typescript
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { requireProjectMember, ProjectAccessError } from '@/lib/project-access';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;  // Next.js 15: params is a Promise
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/login');

  try {
    await requireProjectMember(id, session.user.id);
  } catch (err) {
    if (err instanceof ProjectAccessError) notFound();
    throw err;  // re-throw non-domain errors — never swallow
  }

  const [project] = await db
    .select({ id: projects.id, name: projects.name, ticketKey: projects.ticketKey })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) notFound();
  // ... render
}
```

**Next.js 15 params note:** In Next.js 15+, `params` in page components is a `Promise<{ id: string }>` and must be awaited. The analog (`layout.tsx`) does not use params, so this is a delta not visible in the analog.

**Page shell structure** (from `page.tsx` analog lines 46-57):
```typescript
return (
  <div className="min-h-screen bg-background">
    <header className="flex h-14 items-center justify-between border-b px-6">
      {/* nav */}
    </header>
    <main className="container mx-auto max-w-4xl px-6 py-8">
      {/* content */}
    </main>
  </div>
);
```

Note: The project detail page inherits the `DashboardLayout` (which provides the auth guard), so it may not need its own `<div className="min-h-screen">` wrapper — the layout already renders the outer shell implicitly. Check whether `layout.tsx` renders a nav; currently it only guards (`return <>{children}</>`), so the detail page needs its own nav or can reuse `page.tsx`'s shell structure.

---

### `src/tests/projects.test.ts` (test, CRUD)

**Primary analog:** `src/tests/auth.test.ts`
**Secondary analog:** `src/tests/db.test.ts`

**File header + imports pattern** (analog `auth.test.ts` lines 1-19):
```typescript
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
```

**Delta:** import `projects`, `projectMembers` from `@/db/schema`; import `requireProjectMember`, `ProjectAccessError` from `@/lib/project-access`; import `createProject` from `@/app/actions/projects`.

**Unique-ID-per-run pattern** (analog `auth.test.ts` lines 24-28):
```typescript
function uniqueEmail(tag: string): string {
  const email = `user-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  createdEmails.push(email);
  return email;
}
```

**Delta for projects:** generate unique `ticketKey` per run to avoid unique constraint collisions:
```typescript
function uniqueKey(tag: string): string {
  // 6 uppercase letters — stays within schema constraint A-Z 2-6 chars
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase().replace(/[^A-Z]/g, 'X');
  return `T${tag.slice(0, 2).toUpperCase()}${suffix}`.slice(0, 6);
}
```

**afterEach cleanup pattern** (analog `auth.test.ts` lines 30-33, 42-44):
```typescript
const createdEmails: string[] = [];

afterEach(async () => {
  await deleteByEmails(createdEmails.splice(0, createdEmails.length));
});
```

**Delta:** Track created `projectId` values. Deleting `project` rows cascades to `project_member` and `ticket` rows (schema FK `onDelete: 'cascade'`), so only `projects` rows need explicit cleanup (plus any `users` rows created for the test):
```typescript
const createdProjectIds: string[] = [];
const createdUserEmails: string[] = [];

afterEach(async () => {
  if (createdProjectIds.length > 0) {
    await db.delete(projects).where(inArray(projects.id, createdProjectIds));
    createdProjectIds.length = 0;
  }
  // Clean up test users (cascade removes sessions/accounts)
  if (createdUserEmails.length > 0) {
    await db.delete(users).where(inArray(users.email, createdUserEmails));
    createdUserEmails.length = 0;
  }
});
```

**DATABASE_URL guard pattern** (analog `auth.test.ts` lines 36-40, `db.test.ts` lines 22-27):
```typescript
beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — create .env.local before running tests.');
  }
});
```

**Direct db.insert test data pattern** (analog `db.test.ts` lines 34-44):
```typescript
await db.insert(users).values({
  id: testUserId,
  name: 'DB Connectivity Test',
  email: testEmail,
  emailVerified: false,
  createdAt: now,
  updatedAt: now,
});
```

**Delta:** For project tests, insert users via `auth.api.signUpEmail` (so Better Auth session infrastructure is in place) OR via direct `db.insert(users)` if you only need a userId and don't test auth flows. Use direct insert for speed; use `auth.api.signUpEmail` only when testing the full create-project flow that requires a real session.

**`requireProjectMember` test pattern** (no analog — new behavior; follow the assertion style of `auth.test.ts`):
```typescript
it('MEM-06: requireProjectMember rejects a non-member before any project SELECT', async () => {
  // Arrange: create a project owned by userA
  // ...

  // Act: call requireProjectMember with userB's id (not a member)
  await expect(
    requireProjectMember(projectId, userBId)
  ).rejects.toBeInstanceOf(ProjectAccessError);
});
```

**Vitest config** (`vitest.config.ts` lines 1-18): `environment: 'node'`, `setupFiles: ['src/tests/setup.ts']`, alias `@` → `src/`. No changes needed — projects.test.ts drops in alongside auth.test.ts without config changes.

---

## Shared Patterns

### Session Resolution (all server files)

**Source:** `src/app/dashboard/layout.tsx` lines 21-24 and `src/app/dashboard/page.tsx` lines 38-39

**Apply to:** `src/app/actions/projects.ts`, `src/components/project-list.tsx`, `src/app/dashboard/projects/[id]/page.tsx`

```typescript
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

const session = await auth.api.getSession({ headers: await headers() });
// ALWAYS await headers() — passing the Promise (not the resolved Headers) causes getSession to return null
```

### `db` Import for App Queries

**Source:** `src/lib/db.ts` lines 17-19 and `src/lib/github-token.ts` line 22

**Apply to:** `src/lib/project-access.ts`, `src/app/actions/projects.ts`, `src/components/project-list.tsx`, `src/app/dashboard/projects/[id]/page.tsx`

```typescript
import { db } from '@/lib/db';
// Use `db` (neon-http) for ALL app queries. Never use `authDb` for app mutations.
// `db.batch()` IS available on the neon-http driver and IS atomic.
```

### Minimal-Column Select (DAL convention)

**Source:** `src/lib/github-token.ts` lines 35-39 (token accessor) and lines 55-59 (connection boolean — selects only `id`)

**Apply to:** `src/lib/project-access.ts`, `src/app/dashboard/projects/[id]/page.tsx` (second project select)

```typescript
// Never over-fetch. Select only the columns the caller needs.
// github-token.ts example: selects { id } for boolean check, { accessToken } for token read.
// project-access.ts: select { projectId, userId, role } — minimum for authorization + D-14 role return.
```

### Field-Level Error Display (client components)

**Source:** `src/app/(auth)/login/login-form.tsx` lines 120-138

**Apply to:** `src/components/create-project-dialog.tsx`

```typescript
// Inline error always uses text-destructive text-sm below the relevant input.
// aria-invalid + aria-describedby wired to the error paragraph's id.
{fieldError && (
  <p id="field-error" className="text-destructive text-sm">
    {fieldError}
  </p>
)}
```

### Loader2 Pending State (client components)

**Source:** `src/app/(auth)/login/login-form.tsx` lines 163-167 and `src/components/logout-button.tsx` lines 24-29

**Apply to:** `src/components/create-project-dialog.tsx`

```typescript
<Button type="submit" disabled={isPending}>
  {isPending && <Loader2 className="animate-spin" />}
  {isPending ? 'Creating…' : 'Create project'}
</Button>
```

### `notFound()` Re-throw Pattern

**Source:** No existing analog — established here. Prevents `notFound()` control-flow exception from being swallowed by bare `catch`.

**Apply to:** `src/app/dashboard/projects/[id]/page.tsx`

```typescript
try {
  await requireProjectMember(id, session.user.id);
} catch (err) {
  if (err instanceof ProjectAccessError) notFound();
  throw err;  // REQUIRED: re-throw anything that isn't a ProjectAccessError
}
```

---

## No Analog Found

All 7 files have at least a role-match analog. The following patterns within those files are **new to the codebase** and must be copied from RESEARCH.md rather than an existing file:

| Pattern | File | Reason |
|---------|------|--------|
| `db.batch()` atomic two-row insert | `src/app/actions/projects.ts` | No existing batch insert in codebase — first use |
| `useActionState` hook | `src/components/create-project-dialog.tsx` | Phase 1 forms used manual `useState` + handler; `useActionState` is new here |
| `sql\`cast(count(case when ...) as int)\`` aggregation | `src/components/project-list.tsx` | No aggregate queries exist yet |
| Postgres error code `23505` detection | `src/app/actions/projects.ts` | No constraint-violation handling exists yet |
| Next.js 15 `params` as `Promise<{id}>` | `src/app/dashboard/projects/[id]/page.tsx` | First dynamic route segment in the project |

---

## Key Deltas: Phase 1 Form Pattern vs Phase 2 Server Action

This delta is critical because the Phase 1 forms (`login-form.tsx`, `signup-form.tsx`) look similar to the create-project dialog but use a fundamentally different execution model:

| Property | Phase 1 Login Form | Phase 2 Create Dialog |
|----------|-------------------|----------------------|
| Where action runs | Browser (`authClient.signIn.email`) | Server (`'use server'` action) |
| State management | `useState` + manual handler | `useActionState(serverAction, initial)` |
| Session access | N/A (auth client handles it) | `auth.api.getSession({ headers: await headers() })` |
| Form wiring | `onSubmit={handleSubmit}` | `action={action}` (action ref from `useActionState`) |
| Pending state | `const [loading, setLoading] = useState(false)` | `isPending` from `useActionState` (third return value) |
| Error source | `error` from `authClient` response | `state.errors` from Server Action return value |

---

## Metadata

**Analog search scope:** `src/lib/`, `src/app/dashboard/`, `src/app/(auth)/`, `src/components/`, `src/tests/`
**Files scanned:** 10 (github-token.ts, db.ts, auth.ts, dashboard/layout.tsx, dashboard/page.tsx, auth.test.ts, db.test.ts, setup.ts, login-form.tsx, logout-button.tsx)
**Pattern extraction date:** 2026-06-01
