<!-- One pending email invitation (the non-exported PendingRow of src/components/invite-panel.tsx). -->
<script lang="ts">
  import CopyIcon from '@lucide/svelte/icons/copy';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import MailIcon from '@lucide/svelte/icons/mail';
  import MoreHorizontalIcon from '@lucide/svelte/icons/ellipsis';
  import SendIcon from '@lucide/svelte/icons/send';
  import XIcon from '@lucide/svelte/icons/x';
  import { toast } from 'svelte-sonner';

  // The wrappers refresh the page data after they resolve (React's revalidatePath).
  import { resendInvitation, revokeInvitation } from '@/lib/actions/invite';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { LabelChip } from '@/lib/components/ui-icons';
  import { useProjectPermissions } from '@/lib/components/workspaces/permissions.svelte';
  import { PROJECT_ROLE_LABEL } from '@/lib/components/workspaces/role-rules';
  import { relativeTime } from '@/lib/components/issues/issue-properties';
  import type { PendingInvitation } from './invite-panel.svelte';
  import { announceSent, copyText } from './invite-panel-utils';

  let { projectId, invitation }: { projectId: string; invitation: PendingInvitation } = $props();

  const perms = useProjectPermissions();
  // useTransition: one pending flag for resend and revoke.
  let running = $state(0);
  const isPending = $derived(running > 0);

  // Rendered from a server snapshot; "expired" is recomputed on each render
  // (each time the invitation changes, here).
  const expiresAt = $derived(new Date(invitation.expiresAt));
  const expired = $derived(expiresAt.getTime() <= Date.now());
  const manageable = $derived(perms.assignableRoles.includes(invitation.role));

  async function transition(task: () => Promise<void>) {
    running++;
    try {
      await task();
    } finally {
      running--;
    }
  }

  function resend() {
    void transition(async () => {
      const result = await resendInvitation({ projectId, invitationId: invitation.id });
      if (!result.ok) toast.error(result.error);
      else announceSent(invitation.email, result);
    });
  }

  function revoke() {
    void transition(async () => {
      const result = await revokeInvitation({ projectId, invitationId: invitation.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Invitation for ${invitation.email} revoked`);
    });
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
    {expired ? 'Expired' : PROJECT_ROLE_LABEL[invitation.role]}
  </LabelChip>
  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for the invitation to ${invitation.email}`}
          disabled={isPending}
        >
          {#if isPending}<Loader2Icon class="animate-spin" />{:else}<MoreHorizontalIcon />{/if}
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
