// Project roles: what each role may do (access levels) and who may hand out
// which role. Client-safe — the UI hides what the server would refuse, and the
// server enforces the same tables (authorizeProjectAction, members/invite actions).

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

// Who may change whose role. The owner row only changes through transferOwnership.
//   owner  → sets admin / member / guest on anyone but themselves
//   admin  → sets member / guest on member and guest rows
//   others → nothing
export type AssignableRole = Exclude<ProjectRole, 'owner'>;

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
};

export const PROJECT_ROLE_DESCRIPTION: Record<ProjectRole, string> = {
  owner: 'Full control, including deleting the project',
  admin: 'Manage settings, members and invitations',
  member: 'Create and edit issues',
  guest: 'View and comment only',
};

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
