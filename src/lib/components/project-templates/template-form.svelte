<script lang="ts">
  import { m } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import {
    createProjectTemplate,
    updateProjectTemplate,
    type ProjectTemplateResult,
    type ProjectTemplateRow,
  } from '@/lib/actions/project-templates';
  import { Button } from '@/lib/components/ui/button';
  import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/lib/components/ui/select';
  import { Textarea } from '@/lib/components/ui/textarea';
  import type { TemplateSourceProject, TemplateWorkspaceOption } from './template-types';
  import { invalidateProjectTemplates } from './template-select.svelte.ts';

  const PRIVATE = 'private';

  type Errors = Partial<
    Record<'name' | 'description' | 'workspaceId' | 'projectId' | 'server', string>
  >;

  let {
    template,
    projects = [],
    fixedProject,
    workspaces,
    defaultWorkspaceId,
    onDone,
    onCancel,
  }: {
    template?: ProjectTemplateRow;
    projects?: TemplateSourceProject[];
    fixedProject?: TemplateSourceProject;
    workspaces: TemplateWorkspaceOption[];
    defaultWorkspaceId?: string | null;
    onDone: (saved: ProjectTemplateRow | undefined) => void;
    onCancel: () => void;
  } = $props();

  // Initial values are read once: the parent remounts this form per open.
  const initial = untrack(() => {
    const initialWorkspace = template ? template.workspaceId : (defaultWorkspaceId ?? null);
    return {
      editing: !!template,
      projectId: fixedProject?.id ?? '',
      name: template?.name ?? (fixedProject ? m.projects_template_name_default({ name: fixedProject.name }) : ''),
      description: template?.description ?? '',
      workspaceId:
        initialWorkspace && workspaces.some((w) => w.id === initialWorkspace)
          ? initialWorkspace
          : PRIVATE,
    };
  });
  const editing = initial.editing;
  let projectId = $state(initial.projectId);
  let name = $state(initial.name);
  let description = $state(initial.description);
  let workspaceId = $state(initial.workspaceId);
  let errors = $state<Errors>({});
  let pending = $state(false);
  // Svelte's autofocus only works when nothing has focus; focus on mount instead.
  const focusOnMount = (node: HTMLElement) => node.focus();

  const projectItems = untrack(() => projects).map((p) => ({ value: p.id, label: `${p.ticketKey} ${p.name}` }));
  const workspaceItems = [
    { value: PRIVATE, label: m.projects_template_only_me() },
    ...untrack(() => workspaces).map((w) => ({ value: w.id, label: m.projects_template_everyone_in({ name: w.name }) })),
  ];
  const selectedProject = $derived(projects.find((p) => p.id === projectId));
  const selectedWorkspace = $derived(workspaces.find((w) => w.id === workspaceId));

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    try {
      const shared = workspaceId === PRIVATE ? null : workspaceId;
      let result: ProjectTemplateResult;
      try {
        result = template
          ? await updateProjectTemplate({ id: template.id, name, description, workspaceId: shared })
          : await createProjectTemplate({ projectId, name, description, workspaceId: shared });
      } catch {
        errors = { server: m.common_error_generic() };
        return;
      }
      if (!result.ok) {
        errors = { [result.field ?? 'server']: result.error };
        return;
      }
      invalidateProjectTemplates();
      toast.success(editing ? m.projects_template_updated() : m.projects_template_saved({ name: name.trim() }));
      onDone(result.template);
    } finally {
      pending = false;
    }
  }
</script>

<form onsubmit={submit} class="flex flex-col gap-4" novalidate>
  <DialogHeader>
    <DialogTitle>{editing ? m.projects_template_edit() : m.projects_template_save_as()}</DialogTitle>
    <DialogDescription>
      {editing ? m.projects_template_edit_desc() : m.projects_template_save_desc()}
    </DialogDescription>
  </DialogHeader>

  {#if !editing && !fixedProject}
    <div class="flex flex-col gap-1.5">
      <Label for="template-project">{m.common_project()}</Label>
      {#if projects.length === 0}
        <p class="text-sm text-muted-foreground">
          {m.projects_template_need_admin()}
        </p>
      {:else}
        <Select bind:value={projectId} items={projectItems}>
          <SelectTrigger id="template-project" class="w-full">
            <SelectValue placeholder={m.projects_choose_project()}>
              {#if selectedProject}
                <span class="font-mono text-xs text-muted-foreground">
                  {selectedProject.ticketKey}
                </span>
                {selectedProject.name}
              {:else}
                <span class="text-muted-foreground">{m.projects_choose_project()}</span>
              {/if}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {#each projects as project (project.id)}
              <SelectItem value={project.id}>
                <span class="font-mono text-xs text-muted-foreground">
                  {project.ticketKey}
                </span>
                {project.name}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
      {/if}
      {#if errors.projectId}<p class="text-sm text-destructive">{errors.projectId}</p>{/if}
    </div>
  {/if}

  <div class="flex flex-col gap-1.5">
    <Label for="template-name">{m.common_name()}</Label>
    <Input
      id="template-name"
      bind:value={name}
      maxlength={60}
      {@attach focusOnMount}
      placeholder={m.projects_template_name_placeholder()}
      aria-invalid={errors.name ? true : undefined}
    />
    {#if errors.name}<p class="text-sm text-destructive">{errors.name}</p>{/if}
  </div>

  <div class="flex flex-col gap-1.5">
    <Label for="template-description">{m.common_description()}</Label>
    <Textarea
      id="template-description"
      bind:value={description}
      maxlength={500}
      rows={2}
      placeholder={m.projects_template_description_placeholder()}
    />
    {#if errors.description}<p class="text-sm text-destructive">{errors.description}</p>{/if}
  </div>

  <div class="flex flex-col gap-1.5">
    <Label for="template-share">{m.projects_template_available_to()}</Label>
    <Select bind:value={workspaceId} items={workspaceItems}>
      <SelectTrigger id="template-share" class="w-full">
        <SelectValue>
          {#if selectedWorkspace}
            {m.projects_template_everyone_in({ name: selectedWorkspace.name })}
          {:else}
            {m.projects_template_only_me()}
          {/if}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={PRIVATE}>{m.projects_template_only_me()}</SelectItem>
        {#each workspaces as workspace (workspace.id)}
          <SelectItem value={workspace.id}>
            {m.projects_template_everyone_in({ name: workspace.name })}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
    {#if errors.workspaceId}<p class="text-sm text-destructive">{errors.workspaceId}</p>{/if}
  </div>

  {#if errors.server}
    <p role="alert" class="text-sm text-destructive">
      {errors.server}
    </p>
  {/if}

  <DialogFooter>
    <Button type="button" variant="outline" onclick={onCancel}>{m.common_cancel()}</Button>
    <Button type="submit" disabled={pending || !name.trim() || (!editing && !projectId)}>
      {#if pending}<Loader2Icon class="animate-spin" />{/if}
      {editing ? m.common_save() : m.projects_template_save()}
    </Button>
  </DialogFooter>
</form>
