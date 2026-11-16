// Project roles: what each role may do (access levels) and who may hand out
// which role. Client-safe — the UI hides what the server would refuse, and the
// server enforces the same tables (authorizeProjectAction, members/invite actions).

import { m } from '@/lib/i18n';
import { lazyLabels } from '@/lib/lazy-labels';

export type ProjectRole = 'owner' | 'admin' | 'member' | 'guest';

export type AccessLevel = 'read' | 'comment' | 'write' | 'admin';

const ALLOWED: Record<ProjectRole, readonly AccessLevel[]> = {
  owner: ['read', 'comment', 'write', 'admin'],
  admin: ['read', 'comment', 'write', 'admin'],
  member: ['read', 'comment', 'write'],
  guest: ['read', 'comment'],
};

export function roleAllows(role: ProjectRole, level: AccessLevel): boolean {
  return ALLOWED[role]?.includes(level) ?? false;
}

/** The roles that allow `level`, e.g. the owner/admin set for SQL `inArray(role, …)` filters. */
export function rolesAllowing(level: AccessLevel): ProjectRole[] {
  return (Object.keys(ALLOWED) as ProjectRole[]).filter((role) => ALLOWED[role].includes(level));
}

// Who may change whose role. The owner row only changes through transferOwnership.
//   owner  → sets admin / member / guest on anyone but themselves
//   admin  → sets member / guest on member and guest rows
//   others → nothing
export type AssignableRole = Exclude<ProjectRole, 'owner'>;

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = lazyLabels({
  owner: m.common_role_owner,
  admin: m.common_role_admin,
  member: m.common_role_member,
  guest: m.common_role_guest,
});

export const PROJECT_ROLE_DESCRIPTION: Record<ProjectRole, string> = lazyLabels({
  owner: m.common_role_owner_desc,
  admin: m.common_role_admin_desc,
  member: m.common_role_member_desc,
  guest: m.common_role_guest_desc,
});

const ASSIGNABLE: Record<ProjectRole, readonly AssignableRole[]> = {
  owner: ['admin', 'member', 'guest'],
  admin: ['member', 'guest'],
  member: [],
  guest: [],
};

export function isAssignableRole(value: unknown): value is AssignableRole {
  return value === 'admin' || value === 'member' || value === 'guest';
}

/** Roles `actor` may hand out (invites, role changes). */
export function assignableRoles(actor: ProjectRole): readonly AssignableRole[] {
  return ASSIGNABLE[actor] ?? [];
}

/** Whether `actor` may change or remove a member currently holding `target`. */
export function canManageMember(actor: ProjectRole, target: ProjectRole): boolean {
  if (target === 'owner') return false;
  return (ASSIGNABLE[actor] ?? []).includes(target);
}

/** Whether `actor` may move `target` from their role to `next`. */
export function canSetRole(actor: ProjectRole, target: ProjectRole, next: ProjectRole): boolean {
  return canManageMember(actor, target) && isAssignableRole(next) && assignableRoles(actor).includes(next);
}
