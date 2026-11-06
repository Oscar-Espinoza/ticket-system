// Workspace roles and the client-safe shapes the workspace page hands to its
// components. The role rule here is the one the server enforces.

import type { ProjectRole } from '@/lib/roles';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = { owner: 2, admin: 1, member: 0 };

/** Whether `role` is at least `min` (owner > admin > member). */
export function workspaceRoleAllows(role: WorkspaceRole, min: WorkspaceRole): boolean {
  return (WORKSPACE_ROLE_RANK[role] ?? -1) >= WORKSPACE_ROLE_RANK[min];
}

export const WORKSPACE_ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export interface WorkspaceProjectRow {
  id: string;
  name: string;
  ticketKey: string;
  /** The viewer's role in the project; null = not a member. */
  viewerRole: ProjectRole | null;
  memberCount: number;
  /** Open issues; null when the viewer isn't a member. */
  openCount: number | null;
}

export interface EligibleProject {
  id: string;
  name: string;
  ticketKey: string;
  /** Name of the workspace it currently belongs to, if any. */
  currentWorkspace: string | null;
}

export interface WorkspaceMemberRow {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: WorkspaceRole;
}

/** A pending workspace invitation (admins only see these). */
export interface WorkspaceInvitationRow {
  id: string;
  email: string;
  role: Exclude<WorkspaceRole, 'owner'>;
  /** ISO string. */
  expiresAt: string;
  url: string;
  invitedByName: string | null;
}
