<!-- Invite by email to the workspace. -->
<script lang="ts">
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { workspaceRoleAllows, type WorkspaceRole } from '@/lib/workspace-types';
  import { inviteWorkspaceMember } from '@/lib/actions/workspaces';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { announceSent } from '@/lib/components/invite-toasts';

  let {
    open,
    onClose,
    workspaceId,
    viewerRole,
  }: {
    open: boolean;
    onClose: () => void;
    workspaceId: string;
    viewerRole: WorkspaceRole;
  } = $props();

  const ROLE_ITEMS = [
    { value: 'admin', label: 'Admin' },
    { value: 'member', label: 'Member' },
  ];

  let email = $state('');
  let role = $state<'admin' | 'member'>('member');
  let error = $state<string | null>(null);
  let isPending = $state(false);

  function close() {
    email = '';
    role = 'member';
    error = null;
    onClose();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const value = email.trim();
    isPending = true;
    try {
      const result = await inviteWorkspaceMember({ workspaceId, email: value, role });
      if (!result) return;
      if (!result.ok) {
        error = result.error;
        return;
      }
      if (result.added) toast.success('Added to the workspace');
      else announceSent(value, result);
      close();
    } finally {
      isPending = false;
    }
  }
</script>

<Dialog
  bind:open={() => open, (next) => {
    if (!next) close();
  }}
>
  <DialogContent class="sm:max-w-md">
    <form onsubmit={submit} class="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Invite to workspace</DialogTitle>
        <DialogDescription>
          People you already share a project with are added right away; anyone else gets an email
          invitation valid for 7 days.
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-1.5">
        <Label for="ws-invite-email">Email</Label>
        <div class="flex gap-2">
          <Input
            id="ws-invite-email"
            type="email"
            autofocus
            autocomplete="off"
            bind:value={() => email, (v) => {
              email = v;
              error = null;
            }}
            placeholder="name@company.com"
            aria-invalid={error ? true : undefined}
            class="flex-1"
          />
          {#if workspaceRoleAllows(viewerRole, 'owner')}
            <Select items={ROLE_ITEMS} bind:value={() => role, (v) => (role = v as 'admin' | 'member')}>
              <SelectTrigger class="w-28" aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
          {/if}
        </div>
      </div>
      {#if error}
        <p role="alert" class="text-sm text-destructive">{error}</p>
      {/if}
      <DialogFooter>
        <Button type="button" variant="outline" onclick={close}>Cancel</Button>
        <Button type="submit" disabled={isPending || !email.trim()}>
          {#if isPending}<LoaderCircleIcon class="animate-spin" />{/if}
          Invite
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
