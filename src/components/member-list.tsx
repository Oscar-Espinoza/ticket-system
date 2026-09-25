'use client';

// Project member roster (settings › Members). Each row links to the member's
// profile and, when the viewer's role allows it (role-rules.ts), offers a role
// select, "Transfer ownership" (owner only) and "Remove". The server actions
// enforce the same rules; hiding controls here is UX only.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Crown, MoreHorizontal, UserMinus } from 'lucide-react';

import { Avatar, LabelChip } from '@/components/ui-icons';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { removeMember, transferOwnership, updateMemberRole } from '@/app/actions/members';
import { useProjectPermissions } from '@/components/workspaces/permissions';
import { PROJECT_ROLE_DESCRIPTION, PROJECT_ROLE_LABEL } from '@/components/workspaces/role-rules';
import type { ProjectRole } from '@/lib/roles';

export type MemberListMember = {
  /** project_member row id. */
  id: string;
  userId: string;
  name: string;
  email?: string | null;
  image?: string | null;
  role: ProjectRole;
};

type MemberListProps = {
  members: MemberListMember[];
  currentUserId: string;
  projectId: string;
};

const ROLE_ORDER: Record<ProjectRole, number> = { owner: 0, admin: 1, member: 2, guest: 3 };

export function MemberList({ members, currentUserId, projectId }: MemberListProps) {
  const sorted = [...members].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
  );
  return (
    <ul className="flex flex-col divide-y divide-border/60 rounded-lg border">
      {sorted.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          isSelf={member.userId === currentUserId}
          projectId={projectId}
        />
      ))}
    </ul>
  );
}

function MemberRow({
  member,
  isSelf,
  projectId,
}: {
  member: MemberListMember;
  isSelf: boolean;
  projectId: string;
}) {
  const perms = useProjectPermissions();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<'remove' | 'transfer' | null>(null);

  const canManage = !isSelf && perms.canManage(member.role);
  const canTransfer = perms.isOwner && !isSelf;

  function changeRole(role: string) {
    startTransition(async () => {
      const result = await updateMemberRole({ projectId, memberId: member.id, role: role as ProjectRole });
      if (!result.ok) toast.error(result.error);
      else toast.success(`${member.name} is now ${PROJECT_ROLE_LABEL[role as ProjectRole].toLowerCase()}`);
    });
  }

  function remove() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('projectId', projectId);
      formData.set('memberId', member.id);
      const result = await removeMember({}, formData);
      if (result.errors?.server) toast.error(result.errors.server);
      else toast.success(`${member.name} was removed`);
    });
  }

  function transfer() {
    startTransition(async () => {
      const result = await transferOwnership({ projectId, memberId: member.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`${member.name} now owns this project`);
    });
  }

  return (
    <li className="flex min-h-12 items-center gap-3 px-3 py-2">
      <Link
        href={`/dashboard/people/${member.userId}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar name={member.name} src={member.image} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium hover:underline">
            {member.name}
            {isSelf && <span className="ml-1.5 font-normal text-muted-foreground">(you)</span>}
          </span>
          {member.email && (
            <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
          )}
        </span>
      </Link>

      {canManage ? (
        <Select value={member.role} onValueChange={changeRole} disabled={isPending}>
          <SelectTrigger size="sm" className="w-28" aria-label={`Role of ${member.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {perms.assignableRoles.map((role) => (
              <SelectItem key={role} value={role} title={PROJECT_ROLE_DESCRIPTION[role]}>
                {PROJECT_ROLE_LABEL[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <LabelChip
          color={member.role === 'owner' ? 'primary' : 'default'}
          title={PROJECT_ROLE_DESCRIPTION[member.role]}
        >
          {PROJECT_ROLE_LABEL[member.role]}
        </LabelChip>
      )}

      {canManage || canTransfer ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`More actions for ${member.name}`}
              disabled={isPending}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canTransfer && (
              <DropdownMenuItem onSelect={() => setDialog('transfer')}>
                <Crown />
                Transfer ownership
              </DropdownMenuItem>
            )}
            {canManage && (
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog('remove')}>
                <UserMinus />
                Remove from project
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        // Keeps the role column aligned with rows that have a menu.
        <span className="size-7 shrink-0" aria-hidden="true" />
      )}

      <AlertDialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          {dialog === 'transfer' ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Transfer ownership?</AlertDialogTitle>
                <AlertDialogDescription>
                  <strong>{member.name}</strong> becomes the owner of this project and you
                  become an admin. Only the new owner can transfer it back.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={transfer} disabled={isPending}>
                  Transfer ownership
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove member?</AlertDialogTitle>
                <AlertDialogDescription>
                  <strong>{member.name}</strong> will immediately lose access to this project.
                  You can invite them again later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={remove} disabled={isPending}>
                  Remove member
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
