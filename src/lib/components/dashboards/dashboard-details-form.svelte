<!-- Form half of dashboard-details-dialog.svelte (mounted only while the dialog is open, so it starts fresh). -->
<script lang="ts">
  import LoaderIcon from '@lucide/svelte/icons/loader-circle';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  import { createDashboard, updateDashboard } from '@/lib/actions/dashboards';
  import { Button } from '@/lib/components/ui/button';
  import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { dashboardHref } from '@/components/dashboards/widget-model';

  const ALL = '__all';

  let {
    dashboard,
    projects,
    defaultProjectId,
    onDone,
  }: {
    dashboard?: { id: string; name: string; description: string | null };
    projects: { id: string; name: string }[];
    defaultProjectId: string | null;
    onDone: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(dashboard?.name ?? '');
  // svelte-ignore state_referenced_locally
  let description = $state(dashboard?.description ?? '');
  // svelte-ignore state_referenced_locally
  let scope = $state(defaultProjectId ?? ALL);
  let pending = $state(false);

  const scopeItems = $derived([
    { value: ALL, label: 'All my projects (personal)' },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ]);

  async function submit() {
    pending = true;
    try {
      const result = dashboard
        ? await updateDashboard({ id: dashboard.id, name, description })
        : await createDashboard({ name, description, projectId: scope === ALL ? null : scope });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onDone();
      if (!dashboard) await goto(dashboardHref(result.id));
    } finally {
      pending = false;
    }
  }
</script>

<form
  class="flex flex-col gap-4"
  onsubmit={(event) => {
    event.preventDefault();
    submit();
  }}
>
  <DialogHeader>
    <DialogTitle>{dashboard ? 'Rename dashboard' : 'New dashboard'}</DialogTitle>
    {#if !dashboard}
      <DialogDescription>
        Starts with a few widgets you can edit. Project dashboards can be shared with the project.
      </DialogDescription>
    {/if}
  </DialogHeader>
  <div class="flex flex-col gap-1.5">
    <Label for="dashboard-name">Name</Label>
    <!-- svelte-ignore a11y_autofocus -->
    <Input
      id="dashboard-name"
      bind:value={name}
      maxlength={80}
      autofocus
      required
      placeholder="Team health"
    />
  </div>
  {#if !dashboard}
    <div class="flex flex-col gap-1.5">
      <Label>Scope</Label>
      <Select type="single" bind:value={scope} items={scopeItems}>
        <SelectTrigger aria-label="Scope" class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All my projects (personal)</SelectItem>
          {#each projects as project (project.id)}
            <SelectItem value={project.id}>{project.name}</SelectItem>
          {/each}
        </SelectContent>
      </Select>
    </div>
  {/if}
  <div class="flex flex-col gap-1.5">
    <Label for="dashboard-description">Description</Label>
    <Textarea
      id="dashboard-description"
      bind:value={description}
      maxlength={500}
      rows={2}
      placeholder="Optional"
    />
  </div>
  <DialogFooter>
    <Button type="submit" disabled={pending || !name.trim()}>
      {#if pending}<LoaderIcon class="animate-spin" />{/if}
      {dashboard ? 'Save' : 'Create dashboard'}
    </Button>
  </DialogFooter>
</form>
