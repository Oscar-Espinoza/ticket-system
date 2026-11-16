<!-- Form half of dashboard-details-dialog.svelte (mounted only while the dialog is open, so it starts fresh). -->
<script lang="ts">
  import LoaderIcon from '@lucide/svelte/icons/loader-circle';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  import { createDashboard, updateDashboard } from '@/lib/actions/dashboards';
  import { m } from '@/lib/i18n';
  import { Button } from '@/lib/components/ui/button';
  import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { dashboardHref } from '@/lib/widget-model';

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
    { value: ALL, label: m.editor_dash_scope_personal() },
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
    <DialogTitle>{dashboard ? m.editor_dash_rename_title() : m.editor_dash_new_title()}</DialogTitle>
    {#if !dashboard}
      <DialogDescription>
        {m.editor_dash_intro()}
      </DialogDescription>
    {/if}
  </DialogHeader>
  <div class="flex flex-col gap-1.5">
    <Label for="dashboard-name">{m.common_name()}</Label>
    <!-- svelte-ignore a11y_autofocus -->
    <Input
      id="dashboard-name"
      bind:value={name}
      maxlength={80}
      autofocus
      required
      placeholder={m.editor_dash_name_placeholder()}
    />
  </div>
  {#if !dashboard}
    <div class="flex flex-col gap-1.5">
      <Label>{m.editor_field_scope()}</Label>
      <Select type="single" bind:value={scope} items={scopeItems}>
        <SelectTrigger aria-label={m.editor_field_scope()} class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{m.editor_dash_scope_personal()}</SelectItem>
          {#each projects as project (project.id)}
            <SelectItem value={project.id}>{project.name}</SelectItem>
          {/each}
        </SelectContent>
      </Select>
    </div>
  {/if}
  <div class="flex flex-col gap-1.5">
    <Label for="dashboard-description">{m.common_description()}</Label>
    <Textarea
      id="dashboard-description"
      bind:value={description}
      maxlength={500}
      rows={2}
      placeholder={m.common_optional()}
    />
  </div>
  <DialogFooter>
    <Button type="submit" disabled={pending || !name.trim()}>
      {#if pending}<LoaderIcon class="animate-spin" />{/if}
      {dashboard ? m.common_save() : m.editor_dash_create()}
    </Button>
  </DialogFooter>
</form>
