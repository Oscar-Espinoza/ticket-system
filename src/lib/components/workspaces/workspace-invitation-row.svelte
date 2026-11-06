<!-- One pending workspace invitation: resend / copy link / revoke. -->
<script lang="ts">
  import CopyIcon from '@lucide/svelte/icons/copy';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import MailIcon from '@lucide/svelte/icons/mail';
  import SendIcon from '@lucide/svelte/icons/send';
  import XIcon from '@lucide/svelte/icons/x';
  import { toast } from 'svelte-sonner';

  import {
    WORKSPACE_ROLE_LABEL,
    type WorkspaceInvitationRow,
    type WorkspaceRole,
  } from '@/lib/workspace-types';
  import { resendWorkspaceInvitation, revokeWorkspaceInvitation } from '@/lib/actions/workspaces';
  import { relativeTime } from '@/lib/relative-time';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { LabelChip } from '@/lib/components/ui-icons';
  import { announceSent, copyText } from '@/lib/components/invite-toasts';
  import { canManageRole } from './workspace-role-rules';

  let {
    workspaceId,
    invitation,
    viewerRole,
  }: {
    workspaceId: string;
    invitation: WorkspaceInvitationRow;
    viewerRole: WorkspaceRole;
  } = $props();

  let isPending = $state(false);
  // Rendered from a server snapshot; "expired" is recomputed whenever the row re-renders.
  const expiresAt = $derived(new Date(invitation.expiresAt));
  const expired = $derived(expiresAt.getTime() <= Date.now());
  const manageable = $derived(canManageRole(viewerRole, invitation.role));

  async function resend() {
    isPending = true;
    try {
      const result = await resendWorkspaceInvitation({ workspaceId, invitationId: invitation.id });
      if (!result) return;
      if (!result.ok) toast.error(result.error);
      else announceSent(invitation.email, result);
    } finally {
      isPending = false;
    }
  }

  async function revoke() {
    isPending = true;
    try {
      const result = await revokeWorkspaceInvitation({ workspaceId, invitationId: invitation.id });
      if (!result) return;
      if (!result.ok) toast.error(result.error);
      else toast.success(`Invitation for ${invitation.email} revoked`);
    } finally {
      isPending = false;
    }
  }
</script>

<li class="flex min-h-11 items-center gap-3 px-3 py-2">
  <MailIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  <span class="min-w-0 flex-1">
    <span class="block truncate text-sm">{invitation.email}</span>
    <span class="block truncate text-xs text-muted-foreground">
      {expired ? 'Expired' : `Expires ${relativeTime(expiresAt)}`}{invitation.invitedByName
        ? ` · invited by ${invitation.invitedByName}`
        : ''}
    </span>
  </span>
  <LabelChip color={expired ? 'destructive' : 'default'}>
    {expired ? 'Expired' : WORKSPACE_ROLE_LABEL[invitation.role]}
  </LabelChip>
  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon-sm"
          aria-label="Actions for the invitation to {invitation.email}"
          disabled={isPending}
        >
          {#if isPending}<LoaderCircleIcon class="animate-spin" />{:else}<EllipsisIcon />{/if}
        </Button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {#if manageable}
        <DropdownMenuItem onSelect={resend}>
          <SendIcon />
          {expired ? 'Renew and resend' : 'Resend email'}
        </DropdownMenuItem>
      {/if}
      <DropdownMenuItem onSelect={() => void copyText(invitation.url, 'Invite link')}>
        <CopyIcon />
        Copy invite link
      </DropdownMenuItem>
      {#if manageable}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={revoke}>
          <XIcon />
          Revoke invitation
        </DropdownMenuItem>
      {/if}
    </DropdownMenuContent>
  </DropdownMenu>
</li>
