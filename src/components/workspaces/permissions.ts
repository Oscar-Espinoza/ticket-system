'use client';

// UI gating from the viewer's project role (the server re-checks everything).

import { useMemo } from 'react';

import { useProjectData } from '@/components/project/project-data';
import { roleAllows, type ProjectRole } from '@/lib/roles';
import { assignableRoles, canManageMember, type AssignableRole } from './role-rules';

export interface ProjectPermissions {
  role: ProjectRole;
  isOwner: boolean;
  /** Owner or admin. */
  isAdmin: boolean;
  canWrite: boolean;
  canComment: boolean;
  /** Invite, change roles, remove — for at least some members. */
  canManageMembers: boolean;
  /** Roles the viewer may hand out. */
  assignableRoles: readonly AssignableRole[];
  /** Whether the viewer may change the role of / remove a member with `target`. */
  canManage: (target: ProjectRole) => boolean;
}

export function projectPermissions(role: ProjectRole): ProjectPermissions {
  const isAdmin = roleAllows(role, 'admin');
  return {
    role,
    isOwner: role === 'owner',
    isAdmin,
    canWrite: roleAllows(role, 'write'),
    canComment: roleAllows(role, 'comment'),
    canManageMembers: isAdmin,
    assignableRoles: assignableRoles(role),
    canManage: (target) => canManageMember(role, target),
  };
}

export function useProjectPermissions(): ProjectPermissions {
  const role = useProjectData().project.role;
  return useMemo(() => projectPermissions(role), [role]);
}
