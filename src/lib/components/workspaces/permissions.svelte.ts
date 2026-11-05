// UI gating from the viewer's project role (the server re-checks everything).
//
// Port of src/components/workspaces/permissions.ts. Same exports:
//   projectPermissions(role): ProjectPermissions   pure snapshot for a role
//   useProjectPermissions(): ProjectPermissions    call during component init, below a
//                                                  ProjectDataProvider
// useProjectPermissions() returns a live view: every field reads the current
// project role (it changes on refreshAll / when the [id] param changes), so read
// fields off it in markup, $derived or $effect — destructuring takes a snapshot.

import { useProjectData } from '@/lib/components/project/project-data.svelte';
import { roleAllows, type ProjectRole } from '@/lib/roles';
import { assignableRoles, canManageMember, type AssignableRole } from '@/components/workspaces/role-rules';

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
  const data = useProjectData();
  // Memoized per role, like the React useMemo.
  const current = $derived(projectPermissions(data.project.role));
  return {
    get role() {
      return current.role;
    },
    get isOwner() {
      return current.isOwner;
    },
    get isAdmin() {
      return current.isAdmin;
    },
    get canWrite() {
      return current.canWrite;
    },
    get canComment() {
      return current.canComment;
    },
    get canManageMembers() {
      return current.canManageMembers;
    },
    get assignableRoles() {
      return current.assignableRoles;
    },
    canManage: (target) => current.canManage(target),
  };
}
