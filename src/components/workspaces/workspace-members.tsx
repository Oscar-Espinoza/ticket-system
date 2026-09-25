'use client';

// Workspace › Members: roster (→ member profiles), role select (owner only),
// remove (admins remove members, the owner removes admins too), an invite
// dialog and the pending invitations (resend / copy link / revoke — admins
// manage member invitations, the owner all). The server re-checks every rule
// in src/app/actions/workspaces.ts.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Copy, Loader2, Mail, MoreHorizontal, Send, UserMinus, UserPlus, X } from 'lucide-react';

import {
  inviteWorkspaceMember,
  removeWorkspaceMember,
  resendWorkspaceInvitation,
  revokeWorkspaceInvitation,
  updateWorkspaceMemberRole,
} from '@/app/actions/workspaces';
import { relativeTime } from '@/components/issues/issue-properties';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  WORKSPACE_ROLE_LABEL,
  type WorkspaceInvitationRow,
  type WorkspaceMemberRow,
  type WorkspaceRole,
} from './workspace-types';

const ROLE_ORDER: Record<WorkspaceRole, number> = { owner: 0, admin: 1, member: 2 };

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Copy failed — your browser blocked clipboard access');
  }
}

/** Toast after an invite / resend; offers the link when email is off. */
function announceSent(email: string, result: { emailed?: boolean; url?: string }) {
  if (result.emailed || !result.url) {
    toast.success(`Invitation sent to ${email}`);
    return;
  }
  const url = result.url;
  toast.success('Invitation created', {
    description: 'Email isn’t configured on this server — share the link yourself.',
    action: { label: 'Copy link', onClick: () => void copyText(url, 'Invite link') },
  });
}

export function WorkspaceMembers({
  workspaceId,
  members,
  invitations,
  viewerId,
  role,
}: {
  workspaceId: string;
  members: WorkspaceMemberRow[];
  /** Pending invitations; always empty for non-admins. */
  invitations: WorkspaceInvitationRow[];
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
      {invitations.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Pending invitations · {invitations.length}
          </h3>
          <ul className="flex flex-col divide-y divide-border/60 rounded-lg border">
            {invitations.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                workspaceId={workspaceId}
                invitation={invitation}
                viewerRole={role}
              />
            ))}
          </ul>
        </div>
      )}
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

function InvitationRow({
  workspaceId,
  invitation,
  viewerRole,
}: {
  workspaceId: string;
  invitation: WorkspaceInvitationRow;
  viewerRole: WorkspaceRole;
}) {
  const [isPending, startTransition] = useTransition();
  // Rendered from a server snapshot; "expired" is recomputed on each render.
  const expiresAt = new Date(invitation.expiresAt);
  // eslint-disable-next-line react-hooks/purity -- display-only comparison against the clock
  const expired = expiresAt.getTime() <= Date.now();
  const manageable = viewerRole === 'owner' || (viewerRole === 'admin' && invitation.role === 'member');

  function resend() {
    startTransition(async () => {
      const result = await resendWorkspaceInvitation({ workspaceId, invitationId: invitation.id });
      if (!result.ok) toast.error(result.error);
      else announceSent(invitation.email, result);
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeWorkspaceInvitation({ workspaceId, invitationId: invitation.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Invitation for ${invitation.email} revoked`);
    });
  }

  return (
    <li className="flex min-h-11 items-center gap-3 px-3 py-2">
      <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{invitation.email}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {expired ? 'Expired' : `Expires ${relativeTime(expiresAt)}`}
          {invitation.invitedByName && ` · invited by ${invitation.invitedByName}`}
        </span>
      </span>
      <LabelChip color={expired ? 'destructive' : 'default'}>
        {expired ? 'Expired' : WORKSPACE_ROLE_LABEL[invitation.role]}
      </LabelChip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for the invitation to ${invitation.email}`}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {manageable && (
            <DropdownMenuItem onSelect={resend}>
              <Send />
              {expired ? 'Renew and resend' : 'Resend email'}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void copyText(invitation.url, 'Invite link')}>
            <Copy />
            Copy invite link
          </DropdownMenuItem>
          {manageable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={revoke}>
                <X />
                Revoke invitation
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
      if (result.added) toast.success('Added to the workspace');
      else announceSent(value, result);
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
