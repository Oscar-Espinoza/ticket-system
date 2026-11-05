<!-- One template in Settings → Templates (local helper of template-settings.tsx). -->
<script lang="ts">
  import FilePlus2 from '@lucide/svelte/icons/file-plus-corner';
  import FileText from '@lucide/svelte/icons/file-text';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';

  import type { IssueTemplate } from '@/lib/actions/templates';
  import { projectHref } from '@/components/app-shell/routes';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Avatar, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { formatEstimate } from '@/lib/estimates';
  import { TEMPLATE_PARAM } from './new-issue-bus.svelte';
  import { templateProps } from './templates-store.svelte';

  let {
    template,
    canEdit,
    onEdit,
    onDelete,
  }: {
    template: IssueTemplate;
    canEdit: boolean;
    onEdit: () => void;
    onDelete: () => void;
  } = $props();

  const data = useProjectData();
  const defaults = $derived(templateProps(template, data));
  const state = $derived(data.states.find((s) => s.id === defaults.stateId));
  const assignee = $derived(data.members.find((m) => m.id === defaults.assigneeId));
  const labels = $derived(data.labels.filter((l) => defaults.labelIds?.includes(l.id)));
  const createHref = $derived(
    `${projectHref(data.project.id)}?${TEMPLATE_PARAM}=${encodeURIComponent(template.id)}`,
  );
</script>

<li class="flex min-h-12 items-center gap-3 px-3 py-2 text-sm">
  <FileText class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  <div class="flex min-w-0 flex-1 flex-col">
    {#if canEdit}
      <button
        type="button"
        onclick={onEdit}
        class="truncate text-left font-medium outline-none hover:underline focus-visible:underline"
      >
        {template.name}
      </button>
    {:else}
      <span class="truncate font-medium">{template.name}</span>
    {/if}
    {#if template.title}
      <span class="truncate text-xs text-muted-foreground">{template.title}</span>
    {/if}
  </div>

  <div class="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
    {#if state}
      <span class="flex items-center gap-1" title="Status: {state.name}">
        <StateIcon {state} size={14} />
        {state.name}
      </span>
    {/if}
    {#if defaults.priority && defaults.priority !== 'none'}
      <PriorityIcon priority={defaults.priority} size={14} />
    {/if}
    {#if labels.length > 0}
      <span class="flex items-center gap-0.5" title={labels.map((l) => l.name).join(', ')}>
        {#each labels.slice(0, 4) as l (l.id)}
          <span aria-hidden="true" class="size-2 rounded-full" style:background-color={l.color}></span>
        {/each}
      </span>
    {/if}
    {#if defaults.estimate != null}
      <span>{formatEstimate(data.project.estimateScale, defaults.estimate)}</span>
    {/if}
    {#if assignee}<Avatar name={assignee.name} src={assignee.image} size={20} />{/if}
  </div>

  {#if canEdit}
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props: triggerProps })}
          <Button {...triggerProps} variant="ghost" size="icon-sm" aria-label="Actions for {template.name}">
            <Ellipsis />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-48">
        <DropdownMenuItem>
          {#snippet child({ props: itemProps })}
            <a {...itemProps} href={createHref}>
              <FilePlus2 />
              Create issue
            </a>
          {/snippet}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  {/if}
</li>
