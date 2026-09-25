'use client';

// Workspace › Members: roster (→ member profiles), role select (owner only),
// remove (admins remove members, the owner removes admins too) and an invite
// dialog. The server re-checks every rule in src/app/actions/workspaces.ts.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, MoreHorizontal, UserMinus, UserPlus } from 'lucide-react';

import {
  inviteWorkspaceMember,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from '@/app/actions/workspaces';
import { Avatar, LabelChip } from '@/components/ui-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { WORKSPACE_ROLE_LABEL, type WorkspaceMemberRow, type WorkspaceRole } from './workspace-types';

const ROLE_ORDER: Record<WorkspaceRole, number> = { owner: 0, admin: 1, member: 2 };

export function WorkspaceMembers({
  workspaceId,
  members,
  viewerId,
  role,
}: {
  workspaceId: string;
  members: WorkspaceMemberRow[];
  viewerId: string;
  role: WorkspaceRole;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const sorted = [...members].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
  );

  return (
    <section aria-labelledby="workspace-members">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="workspace-members" className="text-base font-medium">
          Members <span className="text-muted-foreground">· {members.length}</span>
        </h2>
        {role !== 'member' && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setInviteOpen(true)}>
            <UserPlus />
            Invite
          </Button>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-border/60 rounded-lg border">
        {sorted.map((member) => (
          <MemberRow
            key={member.userId}
            workspaceId={workspaceId}
            member={member}
            isSelf={member.userId === viewerId}
            viewerRole={role}
          />
        ))}
      </ul>
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        workspaceId={workspaceId}
        viewerRole={role}
      />
    </section>
  );
}

function MemberRow({
  workspaceId,
  member,
  isSelf,
  viewerRole,
}: {
  workspaceId: string;
  member: WorkspaceMemberRow;
  isSelf: boolean;
  viewerRole: WorkspaceRole;
}) {
  const [isPending, startTransition] = useTransition();
  const canChangeRole = viewerRole === 'owner' && !isSelf && member.role !== 'owner';
  const canRemove =
    !isSelf &&
    member.role !== 'owner' &&
    (viewerRole === 'owner' || (viewerRole === 'admin' && member.role === 'member'));

  function changeRole(role: string) {
    startTransition(async () => {
      const result = await updateWorkspaceMemberRole({
        workspaceId,
        userId: member.userId,
        role: role as 'admin' | 'member',
      });
      if (!result.ok) toast.error(result.error);
      else toast.success(`${member.name} is now ${role}`);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeWorkspaceMember({ workspaceId, userId: member.userId });
      if (!result.ok) toast.error(result.error);
      else toast.success(`${member.name} was removed`);
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
          <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
        </span>
      </Link>
      {canChangeRole ? (
        <Select value={member.role} onValueChange={changeRole} disabled={isPending}>
          <SelectTrigger size="sm" className="w-28" aria-label={`Role of ${member.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <LabelChip color={member.role === 'owner' ? 'primary' : 'default'}>
          {WORKSPACE_ROLE_LABEL[member.role]}
        </LabelChip>
      )}
      {canRemove ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${member.name}`}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={remove}>
              <UserMinus />
              Remove from workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="size-7 shrink-0" aria-hidden="true" />
      )}
    </li>
  );
}

function InviteDialog({
  open,
  onClose,
  workspaceId,
  viewerRole,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  viewerRole: WorkspaceRole;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setEmail('');
    setRole('member');
    setError(null);
    onClose();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = email.trim();
    startTransition(async () => {
      const result = await inviteWorkspaceMember({ workspaceId, email: value, role });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.added) {
        toast.success('Added to the workspace');
      } else if (result.emailed || !result.url) {
        toast.success(`Invitation sent to ${value}`);
      } else {
        const url = result.url;
        toast.success('Invitation created', {
          description: 'Email isn’t configured on this server — share the link yourself.',
          action: {
            label: 'Copy link',
            onClick: () =>
              void navigator.clipboard.writeText(url).then(
                () => toast.success('Invite link copied'),
                () => toast.error('Copy failed'),
              ),
          },
        });
      }
      close();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Invite to workspace</DialogTitle>
            <DialogDescription>
              People you already share a project with are added right away; anyone else gets an
              email invitation valid for 7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-invite-email">Email</Label>
            <div className="flex gap-2">
              <Input
                id="ws-invite-email"
                type="email"
                autoFocus
                autoComplete="off"
                value={email}
                placeholder="name@company.com"
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                className="flex-1"
              />
              {viewerRole === 'owner' && (
                <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'member')}>
                  <SelectTrigger className="w-28" aria-label="Role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !email.trim()}>
              {isPending && <Loader2 className="animate-spin" />}
              Invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
