<!--
  /dashboard/templates: project templates the viewer can use. Owners edit and
  delete theirs; shared templates from workspaces are read-only here.
-->
<script module lang="ts">
  import type { ProjectTemplateRow } from '@/lib/actions/project-templates';
  import { ESTIMATE_SCALE_LABEL } from '@/lib/estimates';

  type DialogState = { kind: 'create' } | { kind: 'edit'; template: ProjectTemplateRow } | null;

  function summaryParts(t: ProjectTemplateRow): string[] {
    const s = t.summary;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    return [
      plural(s.states, 'state'),
      plural(s.labels, 'label'),
      s.issueTemplates > 0 && plural(s.issueTemplates, 'issue template'),
      s.estimateScale !== 'none' && `${ESTIMATE_SCALE_LABEL[s.estimateScale]} estimates`,
      s.cyclesEnabled && 'Cycles',
      s.triageEnabled && 'Triage',
      s.sla && 'SLAs',
    ].filter((part): part is string => typeof part === 'string');
  }
</script>

<script lang="ts">
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import LayoutTemplateIcon from '@lucide/svelte/icons/layout-template';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';

  import { relativeTime } from '@/lib/components/issues/issue-properties';
  import { EmptyState, LabelChip } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import DeleteTemplateDialog from './delete-template-dialog.svelte';
  import TemplateDialog, {
    type TemplateSourceProject,
    type TemplateWorkspaceOption,
  } from './template-dialog.svelte';

  let {
    templates,
    projects,
    workspaces,
  }: {
    templates: ProjectTemplateRow[];
    projects: TemplateSourceProject[];
    workspaces: TemplateWorkspaceOption[];
  } = $props();

  let dialog = $state.raw<DialogState>(null);
  let deleting = $state.raw<ProjectTemplateRow | null>(null);
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col">
  <div class="mb-1 flex items-center gap-2">
    <h1 class="text-xl font-medium">Project templates</h1>
    {#if templates.length > 0}
      <span class="text-sm tabular-nums text-muted-foreground">{templates.length}</span>
    {/if}
    <Button size="sm" class="ml-auto" onclick={() => (dialog = { kind: 'create' })}>
      <PlusIcon />
      New template
    </Button>
  </div>
  <p class="mb-6 text-sm text-muted-foreground">
    Start new projects with a ready-made workflow, labels and settings. Pick a template in the
    “Create project” dialog.
  </p>

  {#if templates.length === 0}
    <EmptyState
      class="rounded-lg border"
      title="No templates yet"
      description="Save a project you administer as a template to reuse its setup."
    >
      {#snippet icon()}<LayoutTemplateIcon />{/snippet}
      {#snippet action()}
        <Button size="sm" variant="outline" onclick={() => (dialog = { kind: 'create' })}>
          <PlusIcon />
          New template
        </Button>
      {/snippet}
    </EmptyState>
  {:else}
    <ul class="flex flex-col divide-y divide-border/60 rounded-lg border">
      {#each templates as template (template.id)}
        <li class="flex items-start gap-3 px-3 py-2.5">
          <LayoutTemplateIcon
            aria-hidden="true"
            class="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate text-sm font-medium">{template.name}</span>
              {#if template.workspaceName}
                <LabelChip dot={false}>{template.workspaceName}</LabelChip>
              {/if}
            </div>
            {#if template.description}
              <p class="truncate text-sm text-muted-foreground">{template.description}</p>
            {/if}
            <p class="mt-0.5 text-xs text-muted-foreground">
              {summaryParts(template).join(' · ')}
            </p>
          </div>
          <span class="mt-0.5 shrink-0 text-xs text-muted-foreground">
            {template.isOwner ? '' : `${template.ownerName ?? 'Someone'} · `}
            {relativeTime(new Date(template.updatedAt))}
          </span>
          {#if template.isOwner}
            <DropdownMenu>
              <DropdownMenuTrigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Actions for {template.name}"
                  >
                    <EllipsisIcon />
                  </Button>
                {/snippet}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => (dialog = { kind: 'edit', template })}>
                  <PencilIcon />
                  Edit…
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => (deleting = template)}>
                  <Trash2Icon />
                  Delete…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          {:else}
            <span class="size-7 shrink-0" aria-hidden="true"></span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <!-- The create/update/delete wrappers refresh the page data themselves, so
       React's router.refresh() after saving / deleting is not repeated. -->
  <TemplateDialog
    open={dialog !== null}
    onOpenChange={(open) => {
      if (!open) dialog = null;
    }}
    template={dialog?.kind === 'edit' ? dialog.template : undefined}
    {projects}
    {workspaces}
  />
  <DeleteTemplateDialog template={deleting} onClose={() => (deleting = null)} />
</div>
