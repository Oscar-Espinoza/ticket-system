<!-- Invite by email to the workspace. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
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
    { value: 'admin', label: m.projects_role_admin() },
    { value: 'member', label: m.projects_role_member() },
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
      if (result.added) toast.success(m.projects_ws_invite_added());
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
        <DialogTitle>{m.projects_ws_invite_title()}</DialogTitle>
        <DialogDescription>
          {m.projects_ws_invite_desc()}
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-1.5">
        <Label for="ws-invite-email">{m.projects_ws_invite_email()}</Label>
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
            placeholder={m.projects_invite_email_placeholder()}
            aria-invalid={error ? true : undefined}
            class="flex-1"
          />
          {#if workspaceRoleAllows(viewerRole, 'owner')}
            <Select items={ROLE_ITEMS} bind:value={() => role, (v) => (role = v as 'admin' | 'member')}>
              <SelectTrigger class="w-28" aria-label={m.projects_role()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{m.projects_role_admin()}</SelectItem>
                <SelectItem value="member">{m.projects_role_member()}</SelectItem>
              </SelectContent>
            </Select>
          {/if}
        </div>
      </div>
      {#if error}
        <p role="alert" class="text-sm text-destructive">{error}</p>
      {/if}
      <DialogFooter>
        <Button type="button" variant="outline" onclick={close}>{m.common_cancel()}</Button>
        <Button type="submit" disabled={isPending || !email.trim()}>
          {#if isPending}<LoaderCircleIcon class="animate-spin" />{/if}
          {m.projects_ws_invite()}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
