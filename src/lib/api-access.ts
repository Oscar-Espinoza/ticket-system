// The access rule shared by the public APIs (REST v1 and GraphQL): a non-member
// is indistinguishable from a missing project, a member below the needed level
// is forbidden. Each API turns the verdict into its own error shape.

import { roleAllows, type AccessLevel, type ProjectRole } from '@/lib/roles';

export type ApiAccess =
  | { kind: 'ok'; role: ProjectRole }
  | { kind: 'not-member' }
  | { kind: 'forbidden'; message: string };

/** `role` is the caller's role in the project, null when they aren't a member. */
export function checkProjectAccess(role: ProjectRole | null, level: AccessLevel): ApiAccess {
  if (!role) return { kind: 'not-member' };
  if (!roleAllows(role, level)) {
    return { kind: 'forbidden', message: `This requires ${level} access to the project.` };
  }
  return { kind: 'ok', role };
}
