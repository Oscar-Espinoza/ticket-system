---
phase: 02-projects-authorization-layer
reviewed: 2026-06-01T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/app/actions/projects.ts
  - src/app/dashboard/page.tsx
  - src/app/dashboard/projects/[id]/page.tsx
  - src/components/create-project-dialog.tsx
  - src/components/project-list.tsx
  - src/components/ui/dialog.tsx
  - src/lib/project-access.ts
  - src/tests/projects.test.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-06-01
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 2 implements the projects + authorization layer: the `createProject` Server Action, the `getProjectsForUser` membership-scoped query, the `requireProjectMember` DAL helper, the project detail page, and the dashboard project list. The authorization core is solid — `requireProjectMember` runs before any project SELECT in the detail page, the INNER JOIN in `getProjectsForUser` correctly scopes rows to the viewer's memberships, and the Server Action resolves the user from the session rather than client input. Input validation for the ticket key is enforced server-side.

However, there is one correctness BLOCKER: the dashboard renders the project list twice (once via `{children}`, once via the directly-mounted `<ProjectList />`), which produces a duplicated UI and a doubled session/DB query per request. Several warnings concern an unvalidated `projectId` reaching the authorization query, a `db.batch` atomicity claim that does not match the neon-http driver's actual semantics, and the unaddressed lint error in `create-project-dialog.tsx`.

## Critical Issues

### CR-01: Dashboard renders the project list twice (duplicate UI + doubled queries)

**File:** `src/app/dashboard/page.tsx:77-78`
**Issue:** The dashboard page renders both `{children}` and `<ProjectList />` back-to-back:
```tsx
{children}
<ProjectList />
```
The header comment (lines 1, 76) describes `{children}` as "the Phase 2 seam: the project list renders here." If the project list is wired into this route's `children` (via a nested route/segment), the page renders the list twice — two "Projects" section headers, two sets of "New project" CTAs, and two full project card lists. Even if `children` is currently always empty for `/dashboard`, `DashboardPage` accepts `children` as a `page`-level prop, which Next.js App Router does not populate for a `page.tsx` (only `layout.tsx` receives `children`). So `{children}` is dead here while `<ProjectList />` is the live render — but the file's own documentation indicates the seam was intended to flow through `children`, signaling a structural mismatch. Either way the result is a contradiction: dead `{children}` plus a hardcoded `<ProjectList />`, and a real risk of double-render if this component is ever reused as a layout. Because `ProjectList` independently calls `auth.api.getSession()` and `getProjectsForUser()`, a double render also doubles the per-request session resolution and the projects query.
**Fix:** Pick one seam. For a `page.tsx`, drop `children` entirely and keep the explicit mount:
```tsx
export default async function DashboardPage() {
  // ...
  return (
    <div className="min-h-screen bg-background">
      {/* header ... */}
      <main className="container mx-auto max-w-4xl px-6 py-8">
        <h2 className="text-xl font-semibold">{greetingFor(user?.name)}</h2>
        {/* badge ... */}
        <ProjectList />
      </main>
    </div>
  );
}
```
Remove the `children` prop and the `{children}` slot so the list renders exactly once.

## Warnings

### WR-01: `requireProjectMember` does not validate `projectId` / `userId` before querying

**File:** `src/lib/project-access.ts:90-107`
**Issue:** `requireProjectMember(projectId, userId)` passes `projectId` straight into the WHERE clause with no guard against empty string, `null`, or `undefined`. In the detail page, `id` comes from the URL (`await params`) and is fully attacker-controlled. An empty or malformed `projectId` will run a query that returns no row and throws `ProjectAccessError` — which is the safe outcome here — but the helper is documented as "the single authorization seam for all project-scoped server functions," so future callers (Server Actions that read `projectId` from `FormData`) may pass `undefined` and rely on undefined behavior. Defense-in-depth: reject falsy inputs explicitly rather than depending on the query returning empty.
**Fix:**
```ts
export async function requireProjectMember(projectId: string, userId: string) {
  if (!projectId || !userId) {
    throw new ProjectAccessError();
  }
  // ... existing query
}
```

### WR-02: `db.batch` is not a rollback-guaranteed atomic transaction on neon-http

**File:** `src/app/actions/projects.ts:59-80`
**Issue:** The comment claims `db.batch([...])` makes "both rows created together or both rolled back. No sequential awaits — eliminates the ownerless-project failure window." On the `drizzle-orm/neon-http` driver, `db.batch()` sends statements as a single non-interactive HTTP request, which Neon wraps in one implicit transaction — so the all-or-nothing claim is broadly correct for these two inserts. However, the comment overstates the guarantee: neon-http `batch()` does NOT support interactive rollback logic, and any caller that later adds a conditional between the two inserts cannot rely on it. More importantly, the duplicate-key path (CR for 23505) depends on the batch surfacing the Postgres error with `.code === '23505'` intact through the Neon driver. This should be confirmed against the actual driver behavior (the `db.batch` error may wrap the underlying `NeonDbError`), because if `.code` is not propagated, a duplicate ticket key throws and 500s instead of returning the field error — directly contradicting the test at `projects.test.ts:324`.
**Fix:** Verify in an integration test (the duplicate-key test already exists at `projects.test.ts:324` — confirm it passes against a real Neon DB, not just a mock). If `.code` is not reliably surfaced through `db.batch`, fall back to catching on a pre-insert uniqueness check or unwrap the nested error:
```ts
const code = (err as { code?: string }).code
  ?? ((err as { cause?: { code?: string } }).cause)?.code;
if (code === '23505') { /* field error */ }
```

### WR-03: Name field has no maximum length validation

**File:** `src/app/actions/projects.ts:39, 44-46`
**Issue:** `name` is only checked for non-emptiness (`if (!name)`). There is no upper bound on length. A user (or script) can submit a multi-megabyte `name`, which is inserted into a `text` column with no limit. While `text` accepts it, this is unvalidated input persisted to the DB and later rendered in the project list and detail header. There is also no trimming of control characters or normalization. The ticket key is tightly validated; the name is not.
**Fix:** Add a length bound consistent with the UI:
```ts
if (!name) {
  errors.name = 'Project name is required.';
} else if (name.length > 100) {
  errors.name = 'Project name must be 100 characters or fewer.';
}
```

### WR-04: `set-state-in-effect` lint error is a real React anti-pattern, not just noise

**File:** `src/components/create-project-dialog.tsx:34-39`
**Issue:** `npm run lint` reports `react-hooks/set-state-in-effect` here. The effect calls `setOpen(false)` and `setTicketKey('')` in response to `state.success`. This is the documented close-on-success pattern, but it does trigger an extra render cycle on every successful submit and the lint rule flags it because effect-driven setState can cause render thrash and is fragile if `state.success` is not reset (the action returns `{ success: true }` and never clears it, so re-opening the dialog and submitting again with an unchanged success flag will not re-fire the effect — the dependency `[state.success]` stays `true`, so a second successful create will NOT auto-close the dialog). This is a latent correctness bug, not only a lint warning: after the first successful create, `state.success` remains `true`; the effect's dependency does not change on the next success, so the dialog stays open.
**Fix:** Drive close from the action result via a key/transition reset, or include a nonce in the returned state so each success is distinct:
```ts
// action returns { success: true, nonce: crypto.randomUUID() }
useEffect(() => {
  if (state.success) { setOpen(false); setTicketKey(''); }
}, [state.success, state.nonce]);
```
Alternatively, reset the form on dialog open and close imperatively from a transition wrapper to satisfy the lint rule and fix the repeat-submit bug.

### WR-05: Mocked duplicate-key and atomicity tests do not exercise the real driver path

**File:** `src/tests/projects.test.ts:38-46, 324-355`
**Issue:** The session and `next/headers` are mocked, which is fine, but the PROJ-01 duplicate-key test (line 324) is the only line of defense for the 23505 error-mapping path (WR-02). If this suite is ever run with `db` itself mocked or against anything other than a real Neon HTTP connection, the `.code === '23505'` branch is never actually validated, and a production duplicate key would 500. The test correctly uses a real `db` per the harness, but there is no assertion that the error path went through `db.batch` (vs. a sequential insert). Given the atomicity claim in the action is load-bearing for the "no ownerless project" security property, add an explicit test that a forced failure of the second insert leaves zero project rows.
**Fix:** Add a test that simulates the second insert failing (e.g., violate the `project_member` insert) and asserts no orphan `project` row remains, proving the batch rolls back both rows.

## Info

### IN-01: Doubled session resolution across dashboard and ProjectList

**File:** `src/app/dashboard/page.tsx:39` and `src/components/project-list.tsx:69`
**Issue:** Both `DashboardPage` and `ProjectList` independently call `auth.api.getSession({ headers: await headers() })`. Even after fixing CR-01, this resolves the session twice per dashboard request. Not a correctness bug (out of scope: performance), but it is a duplicated authorization read worth consolidating by passing `userId` down as a prop.
**Fix:** Resolve the session once in the page and pass `user.id` to `<ProjectList userId={user.id} />`.

### IN-02: `as ProjectMembership` cast is redundant and masks future drift

**File:** `src/lib/project-access.ts:113`
**Issue:** `return membership as ProjectMembership;` casts the Drizzle-inferred row to the declared type. The select already projects exactly `{ projectId, userId, role }`, so the cast is unnecessary and would silently hide a future mismatch if a column is added/removed from the select.
**Fix:** Drop the cast and let inference flow, or type the select result directly.

### IN-03: Empty-state renders a second "New project" trigger with duplicate DOM ids downstream

**File:** `src/components/project-list.tsx:79, 89`
**Issue:** `CreateProjectDialog` is rendered twice on the empty state (section header at line 79 + empty-state CTA at line 89). Each instance mounts its own `<Dialog>` and a form with fixed element ids (`project-name`, `ticket-key`, `name-error`, etc.). Two mounted forms means duplicate `id` attributes in the DOM, which breaks `aria-describedby`/`htmlFor` associations and label-click targeting for screen readers. This is intentional per the UI spec (two CTAs) but the duplicate-id consequence was likely not considered.
**Fix:** Render one `CreateProjectDialog` controlling shared state, or make the two triggers open a single dialog instance instead of two independent dialogs with colliding ids.

### IN-04: Greeting uses server `new Date().getHours()` — server timezone, not user's

**File:** `src/app/dashboard/page.tsx:27-28`
**Issue:** `greetingFor` computes morning/afternoon/evening from the server's `getHours()`. On Vercel this is UTC, so the greeting will be wrong for most users. Cosmetic only.
**Fix:** Compute the greeting client-side, or omit time-of-day, or pass the user's timezone.

---

_Reviewed: 2026-06-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
