<!-- Create a project inside the workspace (CreateProjectDialog in workspace-projects.tsx). -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { createWorkspaceProject } from '@/lib/actions/workspaces';
  import TemplateSelect, { useProjectTemplates } from '@/lib/components/project-templates/template-select.svelte';
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

  let {
    open,
    onClose,
    workspaceId,
  }: {
    open: boolean;
    onClose: () => void;
    workspaceId: string;
  } = $props();

  let name = $state('');
  let ticketKey = $state('');
  let templateId = $state('');
  const templates = useProjectTemplates(() => open);
  let errors = $state<{ name?: string; ticketKey?: string; server?: string }>({});
  let isPending = $state(false);

  function close() {
    name = '';
    ticketKey = '';
    templateId = '';
    errors = {};
    onClose();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    isPending = true;
    try {
      const result = await createWorkspaceProject({
        workspaceId,
        name,
        ticketKey,
        templateId: templateId || undefined,
      });
      if (!result) return;
      if (!result.ok) {
        const field = result.field === 'name' || result.field === 'ticketKey' ? result.field : 'server';
        errors = { [field]: result.error };
        return;
      }
      toast.success('Project created');
      close();
      if (result.projectId) void goto(`/dashboard/projects/${result.projectId}`);
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
        <DialogTitle>New project in workspace</DialogTitle>
        <DialogDescription>You’ll be the project’s owner.</DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-1.5">
        <Label for="ws-project-name">Project name</Label>
        <Input
          id="ws-project-name"
          autofocus
          bind:value={() => name, (v) => {
            name = v;
            errors = {};
          }}
          maxlength={100}
          placeholder="Mobile app"
          aria-invalid={errors.name ? true : undefined}
        />
        {#if errors.name}<p class="text-sm text-destructive">{errors.name}</p>{/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ws-project-key">Ticket key</Label>
        <Input
          id="ws-project-key"
          bind:value={() => ticketKey, (v: string) => {
            ticketKey = v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
            errors = {};
          }}
          placeholder="MOB"
          aria-invalid={errors.ticketKey ? true : undefined}
          aria-describedby="ws-project-key-hint"
          class="font-mono"
        />
        <p id="ws-project-key-hint" class="text-sm text-muted-foreground">
          2–6 uppercase letters, unique across all projects.
        </p>
        {#if errors.ticketKey}<p class="text-sm text-destructive">{errors.ticketKey}</p>{/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ws-project-template">Template</Label>
        <TemplateSelect
          id="ws-project-template"
          templates={templates.current}
          value={templateId}
          onChange={(id) => (templateId = id)}
        />
      </div>
      {#if errors.server}<p class="text-sm text-destructive">{errors.server}</p>{/if}
      <DialogFooter>
        <Button type="button" variant="outline" onclick={close}>Cancel</Button>
        <Button type="submit" disabled={isPending || !name.trim() || ticketKey.length < 2}>
          {#if isPending}<LoaderCircleIcon class="animate-spin" />{/if}
          Create project
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
