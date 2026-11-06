// Who may act on whom in a workspace. Client-safe; the invite and member
// actions in server/actions/workspaces.ts enforce the same rule.

import { workspaceRoleAllows, type WorkspaceRole } from '@/lib/workspace-types';

/** Roles `role` may hand out or manage: the owner manages admins and members, admins manage members. */
export function inviteRolesFor(role: WorkspaceRole): readonly WorkspaceRole[] {
  return role === 'owner' ? ['admin', 'member'] : role === 'admin' ? ['member'] : [];
}

/** Whether `viewer` may manage (remove, or handle the invitation of) someone holding `target`. */
export function canManageRole(viewer: WorkspaceRole, target: WorkspaceRole): boolean {
  return inviteRolesFor(viewer).includes(target);
}

/** Only the owner switches a non-owner member between admin and member, never their own. */
export function canChangeMemberRole(viewer: WorkspaceRole, target: WorkspaceRole, isSelf: boolean): boolean {
  return workspaceRoleAllows(viewer, 'owner') && !isSelf && target !== 'owner';
}

export function canRemoveMember(viewer: WorkspaceRole, target: WorkspaceRole, isSelf: boolean): boolean {
  return !isSelf && canManageRole(viewer, target);
}
