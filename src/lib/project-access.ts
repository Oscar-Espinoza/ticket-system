// Project membership authorization DAL helper — the single authorization seam
// for all project-scoped server functions (D-13, MEM-06).
//
// This is the ONLY place that reads project_member for authorization.
// Centralizing the check here means every Server Component, Server Action, and
// Route Handler that touches project data calls requireProjectMember FIRST —
// before any project-scoped SELECT — enforcing the 403-before-DB guarantee
// (success criterion #4 from the Phase 2 roadmap, T-02-01 threat mitigation).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ SECURITY BOUNDARY (D-13):                                               │
// │   requireProjectMember throws ProjectAccessError BEFORE any project-    │
// │   scoped DB read. Callers must map the error appropriately:             │
// │     - Server Component pages: if (err instanceof ProjectAccessError)    │
// │         notFound()  (enumeration-resistant — D-15)                     │
// │     - Server Actions: return { errors: { server: 'Forbidden' } }       │
// │   NEVER call db.select().from(projects) before this check.             │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Server-only by construction: imports `db` (neon-http) which reads
// DATABASE_URL and must never run in the browser. Only import this from
// server components / route handlers / server actions.
//
// Mirrors the accessor shape of src/lib/github-token.ts (D-13):
//   - Minimal-column select (projectId, userId, role — never over-fetch)
//   - and() + eq() WHERE clause
//   - .limit(1)
//   - null guard → throw instead of returning null (D-14 on success: return row)

import { db } from '@/lib/db';
import { projectMembers } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The membership row returned by requireProjectMember on success (D-14).
 * Includes `role` so Phase 3/4 can implement requireProjectOwner without
 * a second DB query.
 */
export type ProjectMembership = {
  projectId: string;
  userId: string;
  role: 'owner' | 'member';
};

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Thrown by requireProjectMember when userId is not a member of projectId.
 *
 * Call sites distinguish this from other errors via `instanceof`:
 *   - Pages: `if (err instanceof ProjectAccessError) notFound()`
 *   - Actions: `return { errors: { server: 'Forbidden' } }`
 *
 * Per D-15: Server Actions map to a 403-equivalent returned state;
 * Server Component detail pages map to notFound() (enumeration-resistant).
 */
export class ProjectAccessError extends Error {
  constructor(message = 'Not a project member') {
    super(message);
    this.name = 'ProjectAccessError';
  }
}

// ---------------------------------------------------------------------------
// DAL helper
// ---------------------------------------------------------------------------

/**
 * Verifies that `userId` is a member of `projectId`.
 *
 * Runs the project_member membership SELECT FIRST — before any project-scoped
 * data read — and throws ProjectAccessError if no membership row exists.
 * This is the 403-before-DB guarantee (MEM-06, success criterion #4).
 *
 * On success, returns { projectId, userId, role } so callers can implement
 * role-based checks (e.g. requireProjectOwner in Phase 3/4) without a
 * second query.
 *
 * @param projectId - the project to check membership for (untrusted input)
 * @param userId    - the Better Auth user id from the active session
 * @returns ProjectMembership with the member's role
 * @throws ProjectAccessError if userId is not a member of projectId
 */
export async function requireProjectMember(
  projectId: string,
  userId: string,
): Promise<ProjectMembership> {
  // WR-01: defense-in-depth — reject falsy ids explicitly rather than relying
  // on the membership query returning an empty result. projectId is untrusted
  // (URL/FormData), and future callers may pass undefined.
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

  // IN-02: the select projects exactly {projectId, userId, role} and `role` is
  // a text enum, so Drizzle already infers ProjectMembership — no cast needed.
  return membership;
}
