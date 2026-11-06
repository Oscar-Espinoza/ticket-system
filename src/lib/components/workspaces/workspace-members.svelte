<!--
  Workspace › Members: roster (→ member profiles), role select (owner only),
  remove (admins remove members, the owner removes admins too), an invite
  dialog and the pending invitations (resend / copy link / revoke — admins
  manage member invitations, the owner all). The server re-checks every rule
  in src/lib/server/actions/workspaces.ts.
-->
<script lang="ts">
  import UserPlusIcon from '@lucide/svelte/icons/user-plus';

  import {
    workspaceRoleAllows,
    type WorkspaceInvitationRow,
    type WorkspaceMemberRow,
    type WorkspaceRole,
  } from '@/lib/workspace-types';
  import { Button } from '@/lib/components/ui/button';
  import WorkspaceInvitationRowView from './workspace-invitation-row.svelte';
  import WorkspaceInviteDialog from './workspace-invite-dialog.svelte';
  import WorkspaceMemberRowView from './workspace-member-row.svelte';

  let {
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
  } = $props();

  const ROLE_ORDER: Record<WorkspaceRole, number> = { owner: 0, admin: 1, member: 2 };

  let inviteOpen = $state(false);
  const sorted = $derived(
    [...members].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name)),
  );
</script>

<section aria-labelledby="workspace-members">
  <div class="mb-3 flex items-center gap-2">
    <h2 id="workspace-members" class="text-base font-medium">
      Members <span class="text-muted-foreground">· {members.length}</span>
    </h2>
    {#if workspaceRoleAllows(role, 'admin')}
      <Button size="sm" variant="outline" class="ml-auto" onclick={() => (inviteOpen = true)}>
        <UserPlusIcon />
        Invite
      </Button>
    {/if}
  </div>
  <ul class="flex flex-col divide-y divide-border/60 rounded-lg border">
    {#each sorted as member (member.userId)}
      <WorkspaceMemberRowView {workspaceId} {member} isSelf={member.userId === viewerId} viewerRole={role} />
    {/each}
  </ul>
  {#if invitations.length > 0}
    <div class="mt-6">
      <h3 class="mb-2 text-sm font-medium text-muted-foreground">
        Pending invitations · {invitations.length}
      </h3>
      <ul class="flex flex-col divide-y divide-border/60 rounded-lg border">
        {#each invitations as invitation (invitation.id)}
          <WorkspaceInvitationRowView {workspaceId} {invitation} viewerRole={role} />
        {/each}
      </ul>
    </div>
  {/if}
  <WorkspaceInviteDialog
    open={inviteOpen}
    onClose={() => (inviteOpen = false)}
    {workspaceId}
    viewerRole={role}
  />
</section>
