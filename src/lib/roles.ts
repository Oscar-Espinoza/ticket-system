// Project roles → access levels. Client-safe (UI hides what a role can't do);
// the server enforces the same table in authorizeProjectAction.

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
