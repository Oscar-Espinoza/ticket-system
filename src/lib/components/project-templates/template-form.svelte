<script lang="ts">
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
      name: template?.name ?? (fixedProject ? `${fixedProject.name} template` : ''),
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
  // React autoFocus focuses on mount; Svelte's autofocus only does so when nothing has focus.
  const focusOnMount = (node: HTMLElement) => node.focus();

  const projectItems = untrack(() => projects).map((p) => ({ value: p.id, label: `${p.ticketKey} ${p.name}` }));
  const workspaceItems = [
    { value: PRIVATE, label: 'Only me' },
    ...untrack(() => workspaces).map((w) => ({ value: w.id, label: `Everyone in ${w.name}` })),
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
        errors = { server: 'Something went wrong. Try again.' };
        return;
      }
      if (!result.ok) {
        errors = { [result.field ?? 'server']: result.error };
        return;
      }
      invalidateProjectTemplates();
      toast.success(editing ? 'Template updated' : `Saved template “${name.trim()}”`);
      onDone(result.template);
    } finally {
      pending = false;
    }
  }
</script>

<form onsubmit={submit} class="flex flex-col gap-4" novalidate>
  <DialogHeader>
    <DialogTitle>{editing ? 'Edit template' : 'Save as template'}</DialogTitle>
    <DialogDescription>
      {editing
        ? 'Rename the template or change who can use it.'
        : 'Copies the workflow states, labels, estimates, cycle and triage settings, SLAs and issue templates. Issues and members aren’t copied.'}
    </DialogDescription>
  </DialogHeader>

  {#if !editing && !fixedProject}
    <div class="flex flex-col gap-1.5">
      <Label for="template-project">Project</Label>
      {#if projects.length === 0}
        <p class="text-sm text-muted-foreground">
          You need to be an owner or admin of a project to save it as a template.
        </p>
      {:else}
        <Select bind:value={projectId} items={projectItems}>
          <SelectTrigger id="template-project" class="w-full">
            <SelectValue placeholder="Choose a project…">
              {#if selectedProject}
                <span class="font-mono text-xs text-muted-foreground">
                  {selectedProject.ticketKey}
                </span>
                {selectedProject.name}
              {:else}
                <span class="text-muted-foreground">Choose a project…</span>
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
    <Label for="template-name">Name</Label>
    <Input
      id="template-name"
      bind:value={name}
      maxlength={60}
      {@attach focusOnMount}
      placeholder="Engineering team"
      aria-invalid={errors.name ? true : undefined}
    />
    {#if errors.name}<p class="text-sm text-destructive">{errors.name}</p>{/if}
  </div>

  <div class="flex flex-col gap-1.5">
    <Label for="template-description">Description</Label>
    <Textarea
      id="template-description"
      bind:value={description}
      maxlength={500}
      rows={2}
      placeholder="What kind of team is this for?"
    />
    {#if errors.description}<p class="text-sm text-destructive">{errors.description}</p>{/if}
  </div>

  <div class="flex flex-col gap-1.5">
    <Label for="template-share">Available to</Label>
    <Select bind:value={workspaceId} items={workspaceItems}>
      <SelectTrigger id="template-share" class="w-full">
        <SelectValue>
          {#if selectedWorkspace}
            Everyone in {selectedWorkspace.name}
          {:else}
            Only me
          {/if}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={PRIVATE}>Only me</SelectItem>
        {#each workspaces as workspace (workspace.id)}
          <SelectItem value={workspace.id}>
            Everyone in {workspace.name}
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
    <Button type="button" variant="outline" onclick={onCancel}>Cancel</Button>
    <Button type="submit" disabled={pending || !name.trim() || (!editing && !projectId)}>
      {#if pending}<Loader2Icon class="animate-spin" />{/if}
      {editing ? 'Save' : 'Save template'}
    </Button>
  </DialogFooter>
</form>
