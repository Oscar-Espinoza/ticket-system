<!-- Move a project the viewer administers into the workspace. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  // Placeholder swapped for the workspace name in bold (messages can't hold markup).
  const NAME_MARK = '\u0001';

  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import type { EligibleProject } from '@/lib/workspace-types';
  import { addProjectToWorkspace } from '@/lib/actions/workspaces';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';

  let {
    open,
    onClose,
    workspaceId,
    eligible,
  }: {
    open: boolean;
    onClose: () => void;
    workspaceId: string;
    eligible: EligibleProject[];
  } = $props();

  let projectId = $state('');
  let error = $state<string | null>(null);
  let isPending = $state(false);
  const selected = $derived(eligible.find((project) => project.id === projectId));
  const items = $derived(eligible.map((p) => ({ value: p.id, label: p.name })));

  function close() {
    projectId = '';
    error = null;
    onClose();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!projectId) return;
    isPending = true;
    try {
      const result = await addProjectToWorkspace({ workspaceId, projectId });
      if (!result) return;
      if (!result.ok) {
        error = result.error;
        return;
      }
      toast.success(m.projects_ws_project_added({ name: selected?.name ?? m.common_project() }));
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
        <DialogTitle>{m.projects_ws_add_project()}</DialogTitle>
        <DialogDescription>
          {m.projects_ws_add_project_desc()}
        </DialogDescription>
      </DialogHeader>
      {#if eligible.length === 0}
        <p class="text-sm text-muted-foreground">{m.projects_ws_no_eligible()}</p>
      {:else}
        <Select {items} bind:value={projectId}>
          <SelectTrigger class="w-full" aria-label={m.common_project()}>
            <SelectValue placeholder={m.projects_choose_project()}>
              {#snippet children()}
                {#if selected}
                  <span class="font-mono text-xs text-muted-foreground">{selected.ticketKey}</span>
                  {selected.name}
                {:else}
                  {m.projects_choose_project()}
                {/if}
              {/snippet}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {#each eligible as project (project.id)}
              <SelectItem value={project.id} label={project.name}>
                <span class="font-mono text-xs text-muted-foreground">{project.ticketKey}</span>
                {project.name}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
      {/if}
      {#if selected?.currentWorkspace}
        <p class="text-sm text-muted-foreground">
          {#each m.projects_ws_will_leave({ name: NAME_MARK }).split(NAME_MARK) as part, i (i)}{#if i > 0}<strong class="text-foreground">{selected.currentWorkspace}</strong>{/if}{part}{/each}
        </p>
      {/if}
      {#if error}
        <p role="alert" class="text-sm text-destructive">{error}</p>
      {/if}
      <DialogFooter>
        <Button type="button" variant="outline" onclick={close}>{m.common_cancel()}</Button>
        <Button type="submit" disabled={isPending || !projectId}>
          {#if isPending}<LoaderCircleIcon class="animate-spin" />{/if}
          {m.projects_ws_add_project()}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
