# Phase 3: Membership + Invite Links — Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 8 (5 new, 3 modified)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/app/actions/invite.ts` (new) | service/action | CRUD | `src/app/actions/projects.ts` | exact |
| `src/lib/project-access.ts` (modify) | utility | request-response | itself — extend `requireProjectMember` | exact |
| `src/db/schema.ts` (modify) | config/migration | — | itself — add `unique()` constraint | exact |
| `src/app/invite/[token]/page.tsx` (new) | component/page | request-response | `src/app/(auth)/login/page.tsx` + `src/app/dashboard/projects/[id]/page.tsx` | role-match |
| `src/app/dashboard/projects/[id]/members/page.tsx` (new) | component/page | CRUD | `src/app/dashboard/projects/[id]/page.tsx` | exact |
| `src/app/dashboard/projects/[id]/page.tsx` (modify) | component/page | request-response | itself — add Members link to header | exact |
| `src/components/invite-panel.tsx` (new) | component | event-driven | `src/components/create-project-dialog.tsx` | role-match |
| `src/components/member-list.tsx` (new) | component | event-driven | `src/components/project-list.tsx` | role-match |

---

## Pattern Assignments

### `src/app/actions/invite.ts` (service/action, CRUD)

**Analog:** `src/app/actions/projects.ts`

**File header + directive:**
```typescript
'use server';
// All three actions follow the createProject template:
// session resolution → validation → DB write → 23505 mapping → revalidatePath
```

**Imports pattern** (`src/app/actions/projects.ts` lines 13–17):
```typescript
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, projectMembers } from '@/db/schema';
```
Phase 3 extends this with: `import { invitations } from '@/db/schema';` and `import { requireProjectOwner } from '@/lib/project-access';`

**State type pattern** (`src/app/actions/projects.ts` lines 19–26):
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
Each action gets its own `ActionState` type with a `server?` error key and `success?: boolean`.

**Session resolution — FIRST step in every action** (`src/app/actions/projects.ts` lines 32–36):
```typescript
const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user) {
  return { errors: { server: 'Not authenticated' } };
}
```

**ID + timestamp generation** (`src/app/actions/projects.ts` lines 57–60):
```typescript
const projectId = crypto.randomUUID();
const memberId = crypto.randomUUID();
const now = new Date();
```
For `generateInviteLink`: `const inviteId = crypto.randomUUID()`, token via `crypto.randomUUID()` or 32-byte base64url, `expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)`.

**db.batch (no interactive transaction)** (`src/app/actions/projects.ts` lines 65–83):
```typescript
await db.batch([
  db.insert(projects).values({ ... }),
  db.insert(projectMembers).values({ ... }),
]);
```
`generateInviteLink` uses `db.batch` for delete-then-insert (one active row per project). `joinProject` uses a single `db.insert`. `removeMember` uses a single `db.delete`.

**23505 mapping + re-throw pattern** (`src/app/actions/projects.ts` lines 84–101):
```typescript
} catch (err: unknown) {
  const code =
    (err as { code?: string })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  if (code === '23505') {
    return {
      errors: {
        ticketKey: 'This key is already in use. Choose a different one.',
      },
    };
  }
  throw err; // REQUIRED: never swallow unexpected errors
}
```
For `joinProject`: map 23505 to "already a member" (treat as success → redirect). The re-throw on any other code is required.

**revalidatePath** (`src/app/actions/projects.ts` line 105):
```typescript
revalidatePath('/dashboard');
return { success: true };
```
For `generateInviteLink` + `removeMember`: `revalidatePath(\`/dashboard/projects/${projectId}/members\`)`.
For `joinProject`: use `redirect(\`/dashboard/projects/${projectId}\`)` (hard redirect, not revalidate).

**Owner guard placement** — call `requireProjectOwner` immediately after session resolution, before any DB write, in all three owner-only actions. Return `{ errors: { server: 'Forbidden' } }` on `ProjectAccessError` (same pattern as the session guard).

---

### `src/lib/project-access.ts` (utility, request-response — MODIFY)

**Analog:** itself (`src/lib/project-access.ts`)

**Existing shape to extend** (lines 90–123 — full function):
```typescript
export async function requireProjectMember(
  projectId: string,
  userId: string,
): Promise<ProjectMembership> {
  if (!projectId || !userId) {
    throw new ProjectAccessError();
  }

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
    .limit(1);

  if (!membership) {
    throw new ProjectAccessError();
  }

  return membership;
}
```

**`requireProjectOwner` to add** — reuses the `role` returned by `requireProjectMember` (D-14/D-30, no second query):
```typescript
export async function requireProjectOwner(
  projectId: string,
  userId: string,
): Promise<ProjectMembership> {
  const membership = await requireProjectMember(projectId, userId);
  if (membership.role !== 'owner') {
    throw new ProjectAccessError('Not the project owner');
  }
  return membership;
}
```
No new imports needed. No new error class needed (reuse `ProjectAccessError`).

---

### `src/db/schema.ts` (config, migration — MODIFY)

**Analog:** itself (`src/db/schema.ts`)

**Existing unique constraint pattern** (`src/db/schema.ts` lines 123–144 — `tickets` table):
```typescript
export const tickets = pgTable(
  'ticket',
  {
    // ... columns ...
  },
  (table) => ({
    uniqueProjectTicket: unique().on(table.projectId, table.ticketNumber),
  }),
);
```

**`projectMembers` table — change required** (`src/db/schema.ts` lines 101–111):
```typescript
// CURRENT (no unique constraint):
export const projectMembers = pgTable('project_member', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(...),
  userId: text('user_id').notNull().references(...),
  role: text('role', { enum: ['owner', 'member'] }).notNull(),
  createdAt: timestamp('created_at').notNull(),
});

// AFTER (add table-level unique constraint — same pattern as tickets table):
export const projectMembers = pgTable(
  'project_member',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(...),
    userId: text('user_id').notNull().references(...),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => ({
    uniqueProjectMember: unique().on(table.projectId, table.userId),
  }),
);
```

`unique` is already imported at line 19 — no new import needed.

**Migration gate:** After editing schema.ts, run `drizzle-kit generate` then `drizzle-kit push` before testing `joinProject`. Without the live constraint, idempotency is enforced only by app-level check.

---

### `src/app/invite/[token]/page.tsx` (component/page, request-response — NEW)

**Analogs:** `src/app/dashboard/projects/[id]/page.tsx` (server component shape, params-as-Promise, session check) + `src/app/(auth)/login/page.tsx` (public route, centered card layout, session-gated render)

**File structure — public server component, no layout guard:**
This file is outside `/dashboard`, so there is no `DashboardLayout` guard. The page handles auth state internally (three render states, D-26).

**Params resolution** (`src/app/dashboard/projects/[id]/page.tsx` lines 34–36):
```typescript
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
```
Adapt: `params: Promise<{ token: string }>` → `const { token } = await params;`

**Session check on a public page** (does NOT redirect on no-session — just influences render state):
```typescript
const session = await auth.api.getSession({ headers: await headers() });
// session?.user exists → show join card (State A)
// !session?.user   → show sign-in redirect card (State B)
```
Do NOT call `redirect('/login')` unconditionally — the invite page is public (D-26).

**Invalid/expired token → clean page, no data leak** (D-28):
```typescript
// Token lookup: db.select from invitations where token = token AND expiresAt > now
// If no row: render "Invalid invite link" state (State C), no notFound() call.
// notFound() would confirm the token exists/doesn't exist — return 200 with the error state instead.
```

**Centered card layout** (`src/app/(auth)/login/page.tsx` lines 15–19):
```typescript
<div className="flex min-h-screen items-center justify-center px-6 py-12">
  {/* card content */}
</div>
```
UI-SPEC updates to: `"min-h-screen flex items-center justify-center bg-background"`, card `w-full max-w-md`.

**Join button wired to Server Action** — uses `useFormStatus` or `useTransition` in a thin Client Component wrapper. The server component passes `projectId` and `token` as props to the client button so the Server Action can receive them via hidden inputs or bind.

**Redirect on success** — `redirect()` from `next/navigation` inside the Server Action (not `router.push`) for the join action result. Use `import { redirect } from 'next/navigation'`.

---

### `src/app/dashboard/projects/[id]/members/page.tsx` (component/page, CRUD — NEW)

**Analog:** `src/app/dashboard/projects/[id]/page.tsx` (exact match — same route tree, same auth+auth guard pattern, same layout)

**Full server component structure** (`src/app/dashboard/projects/[id]/page.tsx` lines 30–108):

**Imports:**
```typescript
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { requireProjectMember, ProjectAccessError } from '@/lib/project-access';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
```
Phase 3 extends: add `projectMembers, invitations, users` to schema imports; add `and` to drizzle-orm imports; add `Separator` from ui/separator; add `Button` from ui/button; add `Input`, `Label` from ui.

**Step 1–3 are identical** (params → session → requireProjectMember → notFound):
```typescript
const { id } = await params;

const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user) {
  redirect('/login');
}

try {
  await requireProjectMember(id, session.user.id);
} catch (err) {
  if (err instanceof ProjectAccessError) notFound();
  throw err; // REQUIRED
}
```

**Authorization-before-DB guarantee** — requireProjectMember runs before the members list SELECT, matching `src/app/dashboard/projects/[id]/page.tsx` lines 48–53.

**Role check for owner-only UI sections** — use the returned membership.role to conditionally render the invite panel and Remove buttons:
```typescript
const membership = await requireProjectMember(id, session.user.id);
// membership.role === 'owner' → show invite panel + remove buttons
```

**Page layout** — matches project detail page exactly:
```typescript
<div className="min-h-screen bg-background">
  <header className="flex h-14 items-center justify-between border-b px-6">
    <span className="text-sm font-semibold">Ticket System</span>
    <span className="text-sm text-muted-foreground">{session.user.email}</span>
  </header>
  <main className="container mx-auto max-w-4xl px-6 py-8">
    <Link href={`/dashboard/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
      <ChevronLeft className="h-4 w-4" />
      Back to project
    </Link>
    <h1 className="text-xl font-semibold mb-8">Members</h1>
    {/* invite panel (owner-only) + separator + roster */}
  </main>
</div>
```

**Role badge pattern** (`src/components/project-list.tsx` lines 112–118):
```typescript
{p.role === 'owner' ? (
  <Badge variant="secondary">Owner</Badge>
) : (
  <Badge variant="outline">Member</Badge>
)}
```

---

### `src/app/dashboard/projects/[id]/page.tsx` (component/page — MODIFY)

**Analog:** itself

**Current header** (lines 73–76):
```typescript
<header className="flex h-14 items-center justify-between border-b px-6">
  <span className="text-sm font-semibold">Ticket System</span>
  <span className="text-sm text-muted-foreground">{session.user.email}</span>
</header>
```

**Modification:** add a Members link between the brand name and the email. Maintain the `justify-between` structure; add a middle nav group or extend the right side:
```typescript
<header className="flex h-14 items-center justify-between border-b px-6">
  <span className="text-sm font-semibold">Ticket System</span>
  <div className="flex items-center gap-4">
    <Link
      href={`/dashboard/projects/${id}/members`}
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Members
    </Link>
    <span className="text-sm text-muted-foreground">{session.user.email}</span>
  </div>
</header>
```
`id` is already in scope from `const { id } = await params` (line 36). No new imports for `Link` — it is already imported (line 19).

---

### `src/components/invite-panel.tsx` (component, event-driven — NEW)

**Analog:** `src/components/create-project-dialog.tsx` (client component wiring a Server Action with loading state via `useActionState`)

**Client directive + useActionState pattern** (`src/components/create-project-dialog.tsx` lines 1, 47–57):
```typescript
'use client';

const [state, action, isPending] = useActionState(
  async (prevState: CreateProjectState, formData: FormData) => {
    const result = await createProject(prevState, formData);
    if (result.success) {
      setOpen(false);
      setTicketKey('');
    }
    return result;
  },
  initialState,
);
```
For the invite panel: use `useActionState` with `generateInviteLink`. On success the page revalidates — no manual state update needed beyond what `revalidatePath` triggers.

**Loading spinner pattern** (`src/components/create-project-dialog.tsx` lines 143–154):
```typescript
import { Loader2, Plus } from 'lucide-react';

<Button type="submit" disabled={isPending}>
  {isPending ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Creating&hellip;
    </>
  ) : (
    'Create project'
  )}
</Button>
```
For Regenerate button: `<Loader2 className="animate-spin" />` while pending.

**Copy button** — uses `useState` + `navigator.clipboard.writeText`. This is a purely client interaction (not a Server Action), so it needs its own `useState` for the "Copied!" feedback transition:
```typescript
const [copied, setCopied] = useState(false);

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(inviteUrl);
  } catch {
    inputRef.current?.select(); // fallback
  }
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}
```

**Read-only Input for invite URL:**
```typescript
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

<Label htmlFor="invite-url">Invite link</Label>
<Input
  id="invite-url"
  readOnly
  value={inviteUrl}
  className="font-mono text-sm"
  ref={inputRef}
/>
```

**Card container** (`src/components/project-list.tsx` lines 103–106):
```typescript
import { Card, CardContent } from '@/components/ui/card';

<Card>
  <CardContent className="p-4">
    {/* invite panel content */}
  </CardContent>
</Card>
```

---

### `src/components/member-list.tsx` (component, event-driven — NEW)

**Analog:** `src/components/project-list.tsx` (card list + badge pattern)

**Card list pattern** (`src/components/project-list.tsx` lines 101–129):
```typescript
<div className="flex flex-col gap-3">
  {userProjects.map((p) => (
    <Card key={p.id}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{p.name}</span>
            <Badge variant="secondary">Owner</Badge>
          </div>
          {/* right side */}
        </div>
      </CardContent>
    </Card>
  ))}
</div>
```

**Role badge** (`src/components/project-list.tsx` lines 113–118 — confirmed from UI-SPEC):
```typescript
{member.role === 'owner' ? (
  <Badge variant="secondary">Owner</Badge>
) : (
  <Badge variant="outline">Member</Badge>
)}
```

**Remove button** — Client Component needed for AlertDialog trigger. The remove action is `removeMember` (Server Action). Use `useTransition` to track pending state. The AlertDialog is a new component install (`npx shadcn add alert-dialog`) — no existing analog in the codebase, but its structure mirrors `Dialog` in `src/components/ui/dialog.tsx`:
```typescript
// AlertDialog usage pattern (mirrors Dialog):
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="ghost" className="text-destructive">
      <UserMinus className="h-4 w-4" />
      Remove
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Remove member?</AlertDialogTitle>
      <AlertDialogDescription>
        <strong>{memberName}</strong> will immediately lose access to this project.
        This cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => startTransition(() => removeMember(projectId, memberId))}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        Remove member
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Shared Patterns

### Session Resolution
**Source:** `src/app/dashboard/projects/[id]/page.tsx` lines 39–41
**Apply to:** All server components and server actions
```typescript
const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user) {
  redirect('/login'); // in pages
  // return { errors: { server: 'Not authenticated' } }; // in actions
}
```

### Authorization-Before-DB (403-before-DB guarantee)
**Source:** `src/app/dashboard/projects/[id]/page.tsx` lines 47–53
**Apply to:** `members/page.tsx`, all three new Server Actions
```typescript
try {
  await requireProjectMember(id, session.user.id);
} catch (err) {
  if (err instanceof ProjectAccessError) notFound();
  throw err; // REQUIRED: re-throw non-domain errors
}
```
For Server Actions: catch → `return { errors: { server: 'Forbidden' } }` instead of `notFound()`.

### 23505 Error Mapping
**Source:** `src/app/actions/projects.ts` lines 84–101
**Apply to:** `joinProject` (idempotent join backstop), `generateInviteLink` (if re-inserting)
```typescript
const code =
  (err as { code?: string })?.code ??
  (err as { cause?: { code?: string } })?.cause?.code;
if (code === '23505') {
  // treat as "already a member" → redirect to project (joinProject)
  // or treat as "link already exists" → update instead (generateInviteLink)
}
throw err; // REQUIRED
```

### neon-http / No Interactive Transactions
**Source:** `src/lib/db.ts` lines 17–19; `src/app/actions/projects.ts` lines 65–83
**Apply to:** All new Server Actions
```typescript
// Use db.batch([...]) for multi-statement atomicity — NOT db.transaction()
// db is neon-http; interactive transactions throw "No transactions support"
await db.batch([
  db.delete(invitations).where(eq(invitations.projectId, projectId)),
  db.insert(invitations).values({ id, projectId, token, expiresAt, createdAt: now }),
]);
```

### Client Component Loading State
**Source:** `src/components/create-project-dialog.tsx` lines 47–57, 143–154
**Apply to:** `invite-panel.tsx` (Regenerate button), `member-list.tsx` (Remove button)
```typescript
import { Loader2 } from 'lucide-react';

// With useActionState:
const [state, action, isPending] = useActionState(serverAction, initialState);
// With useTransition:
const [isPending, startTransition] = useTransition();

<Button disabled={isPending}>
  {isPending && <Loader2 className="animate-spin" />}
  {isPending ? 'Loading…' : 'Label'}
</Button>
```

### Page Layout Shell
**Source:** `src/app/dashboard/projects/[id]/page.tsx` lines 72–86
**Apply to:** `members/page.tsx`
```typescript
<div className="min-h-screen bg-background">
  <header className="flex h-14 items-center justify-between border-b px-6">
    <span className="text-sm font-semibold">Ticket System</span>
    <span className="text-sm text-muted-foreground">{session.user.email}</span>
  </header>
  <main className="container mx-auto max-w-4xl px-6 py-8">
    {/* Back link — same class string, different href */}
    <Link
      href={`/dashboard/projects/${id}`}
      className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6"
    >
      <ChevronLeft className="h-4 w-4" />
      Back to project
    </Link>
  </main>
</div>
```

### NEXT_PUBLIC_APP_URL for Absolute Invite URL
**Source:** `CONTEXT.md` D-25; present in `.env.local` + `.env.example`
**Apply to:** `invite-panel.tsx` (display URL), `generateInviteLink` action (return URL)
```typescript
const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
// In client component, use env var or pass as prop from server component:
// <InvitePanel inviteUrl={`${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`} />
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/ui/alert-dialog.tsx` | ui primitive | event-driven | Not yet installed; must run `npx shadcn add alert-dialog`. Structure will mirror `src/components/ui/dialog.tsx` (same Radix primitive pattern). |

---

## Metadata

**Analog search scope:** `src/app/`, `src/lib/`, `src/db/`, `src/components/`
**Files read:** 14
**Pattern extraction date:** 2026-06-01
