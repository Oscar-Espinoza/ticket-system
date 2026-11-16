<!--
  Workspace header "…" menu: rename (admin), leave (non-owner), delete (owner,
  confirm by typing the name). Leave and delete redirect server-side.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  // Placeholder swapped for the workspace name in bold (messages can't hold markup).
  const NAME_MARK = '\u0001';

  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import LogOutIcon from '@lucide/svelte/icons/log-out';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import { toast } from 'svelte-sonner';

  import { workspaceRoleAllows, type WorkspaceRole } from '@/lib/workspace-types';
  import { deleteWorkspace, leaveWorkspace, renameWorkspace } from '@/lib/actions/workspaces';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';

  type DialogKind = 'rename' | 'leave' | 'delete' | null;

  let { workspace, role }: { workspace: { id: string; name: string }; role: WorkspaceRole } = $props();

  let dialog = $state<DialogKind>(null);
  let value = $state('');
  let error = $state<string | null>(null);
  let isPending = $state(false);
  const isAdmin = $derived(workspaceRoleAllows(role, 'admin'));

  function open(kind: DialogKind) {
    value = kind === 'rename' ? workspace.name : '';
    error = null;
    dialog = kind;
  }

  async function run() {
    isPending = true;
    try {
      const result =
        dialog === 'rename'
          ? await renameWorkspace({ workspaceId: workspace.id, name: value })
          : dialog === 'delete'
            ? await deleteWorkspace({ workspaceId: workspace.id, confirm: value })
            : await leaveWorkspace({ workspaceId: workspace.id });
      // Leave/delete redirect on success: the wrapper navigates and resolves undefined.
      if (!result) return;
      if (!result.ok) {
        error = result.error;
        return;
      }
      toast.success(m.projects_ws_renamed());
      dialog = null;
    } finally {
      isPending = false;
    }
  }
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="icon-sm" aria-label={m.projects_ws_actions()}>
        <EllipsisIcon />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    {#if isAdmin}
      <DropdownMenuItem onSelect={() => open('rename')}>
        <PencilIcon />
        {m.projects_ws_rename_item()}
      </DropdownMenuItem>
    {/if}
    {#if role !== 'owner'}
      <DropdownMenuItem onSelect={() => open('leave')}>
        <LogOutIcon />
        {m.projects_ws_leave_item()}
      </DropdownMenuItem>
    {/if}
    {#if role === 'owner'}
      {#if isAdmin}<DropdownMenuSeparator />{/if}
      <DropdownMenuItem variant="destructive" onSelect={() => open('delete')}>
        <Trash2Icon />
        {m.projects_ws_delete_item()}
      </DropdownMenuItem>
    {/if}
  </DropdownMenuContent>
</DropdownMenu>

<Dialog
  bind:open={() => dialog !== null, (next) => {
    if (!next) dialog = null;
  }}
>
  <DialogContent class="sm:max-w-md">
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void run();
      }}
      class="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>
          {dialog === 'rename'
            ? m.projects_ws_rename_title()
            : dialog === 'delete'
              ? m.projects_ws_delete_title({ name: workspace.name })
              : m.projects_ws_leave_title({ name: workspace.name })}
        </DialogTitle>
        <DialogDescription>
          {dialog === 'rename'
            ? m.projects_ws_rename_desc()
            : dialog === 'delete'
              ? m.projects_ws_delete_desc()
              : m.projects_ws_leave_desc()}
        </DialogDescription>
      </DialogHeader>

      {#if dialog !== 'leave'}
        <div class="flex flex-col gap-1.5">
          <Label for="workspace-dialog-input">
            {#if dialog === 'delete'}
              {#each m.projects_ws_type_to_confirm({ name: NAME_MARK }).split(NAME_MARK) as part, i (i)}{#if i > 0}<strong>{workspace.name}</strong>{/if}{part}{/each}
            {:else}
              {m.common_name()}
            {/if}
          </Label>
          <Input
            id="workspace-dialog-input"
            autofocus
            bind:value={() => value, (v) => {
              value = v;
              error = null;
            }}
            maxlength={60}
            aria-invalid={error ? true : undefined}
          />
        </div>
      {/if}
      {#if error}
        <p role="alert" class="text-sm text-destructive">{error}</p>
      {/if}

      <DialogFooter>
        <Button type="button" variant="outline" onclick={() => (dialog = null)}>{m.common_cancel()}</Button>
        <Button
          type="submit"
          variant={dialog === 'rename' ? 'default' : 'destructive'}
          disabled={isPending ||
            (dialog === 'delete' && value.trim() !== workspace.name) ||
            (dialog === 'rename' && !value.trim())}
        >
          {#if isPending}<LoaderCircleIcon class="animate-spin" />{/if}
          {dialog === 'rename' ? m.common_save() : dialog === 'delete' ? m.projects_ws_delete() : m.projects_ws_leave()}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
