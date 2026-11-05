<!-- Move a project the viewer administers into the workspace (AddProjectDialog in workspace-projects.tsx). -->
<script lang="ts">
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import type { EligibleProject } from '@/lib/components/workspaces/workspace-types';
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
      toast.success(`${selected?.name ?? 'Project'} added`);
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
        <DialogTitle>Add project</DialogTitle>
        <DialogDescription>
          Move a project you own or administer into this workspace. Its members and issues don’t change.
        </DialogDescription>
      </DialogHeader>
      {#if eligible.length === 0}
        <p class="text-sm text-muted-foreground">You don’t administer any project outside this workspace.</p>
      {:else}
        <Select {items} bind:value={projectId}>
          <SelectTrigger class="w-full" aria-label="Project">
            <SelectValue placeholder="Choose a project…">
              {#snippet children()}
                {#if selected}
                  <span class="font-mono text-xs text-muted-foreground">{selected.ticketKey}</span>
                  {selected.name}
                {:else}
                  Choose a project…
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
          It will leave <strong class="text-foreground">{selected.currentWorkspace}</strong>.
        </p>
      {/if}
      {#if error}
        <p role="alert" class="text-sm text-destructive">{error}</p>
      {/if}
      <DialogFooter>
        <Button type="button" variant="outline" onclick={close}>Cancel</Button>
        <Button type="submit" disabled={isPending || !projectId}>
          {#if isPending}<LoaderCircleIcon class="animate-spin" />{/if}
          Add project
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
