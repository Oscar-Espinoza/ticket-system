<!--
  Issue detail — rendered in the list's side pane ('pane') and on the
  permalink page ('page'). The header, properties panel and sections host
  slot components; this host's layout is frozen.
-->
<script module lang="ts">
  // Menu hints for the shortcuts IssueShortcuts registers.
  const COPY_LINK_KEY = { mod: true, shift: true, key: ',' };
  const COPY_ID_KEY = { mod: true, key: '.' };

</script>

<script lang="ts">
  import { copyToClipboard } from '@/lib/components/clipboard';
  import { DATE_TIME_MEDIUM_FORMAT } from '@/lib/format';
  import ArchiveIcon from '@lucide/svelte/icons/archive';
  import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore';
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import GitBranchIcon from '@lucide/svelte/icons/git-branch';
  import HashIcon from '@lucide/svelte/icons/hash';
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import MoreHorizontalIcon from '@lucide/svelte/icons/ellipsis';
  import TagIcon from '@lucide/svelte/icons/tag';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import TriangleIcon from '@lucide/svelte/icons/triangle';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';
  import XIcon from '@lucide/svelte/icons/x';
  import type { Snippet } from 'svelte';

    import {
    AssigneePicker,
    DueDatePicker,
    EstimatePicker,
    LabelPicker,
    PriorityPicker,
    StatePicker,
  } from '@/lib/components/issue-pickers';
  import DueDateChip from '@/lib/components/issues/due-date-chip.svelte';
  import LabelChips from '@/lib/components/issues/label-chips.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { Avatar, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { formatEstimate } from '@/lib/estimates';
  import { formatHotkey } from '@/lib/svelte/hotkeys.svelte';
  import { issueUrl } from '@/lib/issue-links';
  import { PRIORITY_LABEL, type IssuePatch, type IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import PropertyRow from './property-row.svelte';
  import { useDraft } from './use-draft.svelte';
  import DescriptionEditor from './description-editor.svelte';
  import HeaderFavorite from './header-favorite.svelte';
  import HeaderGithub from './header-github.svelte';
  import HeaderPresence from './header-presence.svelte';
  import HeaderRemind from './header-remind.svelte';
  import HeaderSubscribe from './header-subscribe.svelte';
  import MenuExtraItems from './menu-extra-items.svelte';
  import MenuMove from './menu-move.svelte';
  import PropertyCycle from './property-cycle.svelte';
  import PropertyEpic from './property-epic.svelte';
  import PropertyParent from './property-parent.svelte';
  import PropertySla from './property-sla.svelte';
  import PropertyStartDate from './property-start-date.svelte';
  import SectionActivity from './section-activity.svelte';
  import SectionAttachments from './section-attachments.svelte';
  import SectionCustomers from './section-customers.svelte';
  import SectionPullRequests from './section-pull-requests.svelte';
  import SectionRelations from './section-relations.svelte';
  import SectionSimilar from './section-similar.svelte';
  import SectionSubIssues from './section-sub-issues.svelte';

  let {
    issue,
    mutations,
    variant = 'pane',
    onClose,
  }: {
    issue: IssueRow;
    mutations: IssueMutations;
    /** 'pane' = narrow single column; 'page' = content + properties sidebar. */
    variant?: 'pane' | 'page';
    /** Shows the close button and runs after archive / trash. */
    onClose?: () => void;
  } = $props();

  const data = useProjectData();
  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  const title = useDraft(() => issue.title);
  const update = (patch: IssuePatch) => mutations.update(issue, patch);

  function saveTitle() {
    const next = title.current.trim();
    if (!next) {
      title.current = issue.title;
      return;
    }
    if (next !== issue.title) update({ title: next });
  }

  /** Ghost property button classes. */
  const propertyButton = (extra?: string) => cn('-ml-2 max-w-full gap-2 font-normal', extra);
</script>

{#snippet muted(text: string)}
  <span class="text-muted-foreground">{text}</span>
{/snippet}

<!--
  Read-only roles (guests) see the same buttons, disabled, without pickers.
  `trigger` receives the picker's trigger props (asChild) or `{}` when read-only.
-->
{#snippet picker(trigger: Snippet<[Record<string, unknown>]>, wrap: Snippet<[Snippet<[Record<string, unknown>]>]>)}
  {#if canWrite}
    {@render wrap(trigger)}
  {:else}
    {@render trigger({})}
  {/if}
{/snippet}

{#snippet header()}
  <div class="flex items-center gap-2">
    <span class="font-mono text-xs text-muted-foreground">{issue.key}</span>
    <div class="ml-auto flex items-center gap-1">
      <HeaderPresence {issue} {mutations} />
      <HeaderFavorite {issue} {mutations} />
      <HeaderSubscribe {issue} {mutations} />
      <HeaderRemind {issue} {mutations} />
      <HeaderGithub {issue} {mutations} />
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label="Issue actions">
              <MoreHorizontalIcon />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-56">
          <DropdownMenuItem onSelect={() => copyToClipboard(issueUrl(data.project.id, issue.key), 'link')}>
            <Link2Icon />
            Copy link
            <DropdownMenuShortcut>{formatHotkey(COPY_LINK_KEY)}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copyToClipboard(issue.key, issue.key)}>
            <HashIcon />
            Copy ID
            <DropdownMenuShortcut>{formatHotkey(COPY_ID_KEY)}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <MenuMove {issue} {mutations} />
          <MenuExtraItems {issue} {mutations} />
          {#if canWrite}
            <DropdownMenuSeparator />
            {#if issue.archivedAt || issue.deletedAt}
              <DropdownMenuItem onSelect={() => mutations.restore(issue)}>
                <ArchiveRestoreIcon />
                Restore
              </DropdownMenuItem>
            {:else}
              <DropdownMenuItem onSelect={() => mutations.archive(issue, onClose)}>
                <ArchiveIcon />
                Archive
              </DropdownMenuItem>
            {/if}
            {#if !issue.deletedAt}
              <DropdownMenuItem variant="destructive" onSelect={() => mutations.remove(issue, onClose)}>
                <Trash2Icon />
                Move to trash
              </DropdownMenuItem>
            {/if}
          {/if}
        </DropdownMenuContent>
      </DropdownMenu>
      {#if onClose}
        <Button variant="ghost" size="icon-sm" aria-label="Close issue" onclick={onClose}>
          <XIcon />
        </Button>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet banner()}
  {#if issue.archivedAt || issue.deletedAt}
    <div class="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
      {#if issue.deletedAt}<Trash2Icon class="size-4" />{:else}<ArchiveIcon class="size-4" />{/if}
      <span>{issue.deletedAt ? 'This issue is in the trash.' : 'This issue is archived.'}</span>
      {#if canWrite}
        <Button size="xs" variant="outline" class="ml-auto" onclick={() => mutations.restore(issue)}>
          Restore
        </Button>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet titleField()}
  <Textarea
    aria-label="Title"
    bind:value={title.current}
    maxlength={200}
    rows={1}
    readonly={!canWrite}
    onblur={saveTitle}
    onkeydown={(e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        title.current = issue.title;
        e.currentTarget.blur();
      }
    }}
    class="min-h-0 resize-none border-transparent bg-transparent px-1 py-0.5 text-lg font-medium shadow-none hover:border-border dark:bg-transparent"
  />
{/snippet}

<!-- Status -->
{#snippet statusTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" class={propertyButton()} disabled={!canWrite}>
    <StateIcon state={issue.state} size={14} />
    <span class="truncate">{issue.state.name}</span>
  </Button>
{/snippet}
{#snippet statusWrap(trigger: Snippet<[Record<string, unknown>]>)}
  <StatePicker value={issue.stateId} onChange={(stateId) => update({ stateId })}>
    {#snippet children({ props })}{@render trigger(props)}{/snippet}
  </StatePicker>
{/snippet}

<!-- Priority -->
{#snippet priorityTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" class={propertyButton()} disabled={!canWrite}>
    <PriorityIcon priority={issue.priority} size={14} />
    {#if issue.priority === 'none'}{@render muted('Set priority')}{:else}{PRIORITY_LABEL[issue.priority]}{/if}
  </Button>
{/snippet}
{#snippet priorityWrap(trigger: Snippet<[Record<string, unknown>]>)}
  <PriorityPicker value={issue.priority} onChange={(priority) => update({ priority })}>
    {#snippet children({ props })}{@render trigger(props)}{/snippet}
  </PriorityPicker>
{/snippet}

<!-- Assignee -->
{#snippet assigneeTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" class={propertyButton()} disabled={!canWrite}>
    {#if issue.assignee}
      <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
      <span class="truncate">{issue.assignee.name}</span>
    {:else}
      <UserRoundIcon class="text-muted-foreground" />
      {@render muted('Unassigned')}
    {/if}
  </Button>
{/snippet}
{#snippet assigneeWrap(trigger: Snippet<[Record<string, unknown>]>)}
  <AssigneePicker value={issue.assignee?.id ?? null} onChange={(assigneeId) => update({ assigneeId })}>
    {#snippet children({ props })}{@render trigger(props)}{/snippet}
  </AssigneePicker>
{/snippet}

<!-- Labels -->
{#snippet labelsTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" class={propertyButton('h-auto min-h-7 py-1')} disabled={!canWrite}>
    {#if issue.labels.length > 0}
      <LabelChips labels={issue.labels} max={6} class="flex-wrap" />
    {:else}
      <TagIcon class="text-muted-foreground" />
      {@render muted('Add label')}
    {/if}
  </Button>
{/snippet}
{#snippet labelsWrap(trigger: Snippet<[Record<string, unknown>]>)}
  <LabelPicker value={issue.labels.map((l) => l.id)} onChange={(labelIds) => update({ labelIds })}>
    {#snippet children({ props })}{@render trigger(props)}{/snippet}
  </LabelPicker>
{/snippet}

<!-- Estimate -->
{#snippet estimateTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" class={propertyButton()} disabled={!canWrite}>
    <TriangleIcon class="text-muted-foreground" />
    {#if issue.estimate === null}
      {@render muted('Set estimate')}
    {:else}
      {formatEstimate(data.project.estimateScale, issue.estimate)}
    {/if}
  </Button>
{/snippet}
{#snippet estimateWrap(trigger: Snippet<[Record<string, unknown>]>)}
  <EstimatePicker value={issue.estimate} onChange={(estimate) => update({ estimate })}>
    {#snippet children({ props })}{@render trigger(props)}{/snippet}
  </EstimatePicker>
{/snippet}

<!-- Due date -->
{#snippet dueTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" class={propertyButton()} disabled={!canWrite}>
    {#if issue.dueDate}
      <DueDateChip dueDate={issue.dueDate} stateType={issue.state.type} class="border-0 px-0" />
    {:else}
      <CalendarDaysIcon class="text-muted-foreground" />
      {@render muted('Set due date')}
    {/if}
  </Button>
{/snippet}
{#snippet dueWrap(trigger: Snippet<[Record<string, unknown>]>)}
  <DueDatePicker value={issue.dueDate} onChange={(dueDate) => update({ dueDate })}>
    {#snippet children({ props })}{@render trigger(props)}{/snippet}
  </DueDatePicker>
{/snippet}

{#snippet properties()}
  <div class="flex flex-col gap-1">
    <PropertyRow label="Status">
      {@render picker(statusTrigger, statusWrap)}
    </PropertyRow>

    <PropertyRow label="Priority">
      {@render picker(priorityTrigger, priorityWrap)}
    </PropertyRow>

    <PropertyRow label="Assignee">
      {@render picker(assigneeTrigger, assigneeWrap)}
    </PropertyRow>

    <PropertyRow label="Labels">
      {@render picker(labelsTrigger, labelsWrap)}
    </PropertyRow>

    {#if data.project.estimateScale !== 'none'}
      <PropertyRow label="Estimate">
        {@render picker(estimateTrigger, estimateWrap)}
      </PropertyRow>
    {/if}

    <PropertyRow label="Due date">
      {@render picker(dueTrigger, dueWrap)}
    </PropertyRow>

    <PropertyStartDate {issue} {mutations} />
    <PropertySla {issue} {mutations} />
    <PropertyParent {issue} {mutations} />
    <PropertyCycle {issue} {mutations} />
    <PropertyEpic {issue} {mutations} />

    {#if issue.githubBranch}
      <PropertyRow label="Branch">
        <span class="flex items-center gap-1.5 truncate font-mono text-xs">
          <GitBranchIcon class="size-3.5 shrink-0 text-muted-foreground" />
          {issue.githubBranch}
        </span>
      </PropertyRow>
    {/if}

    <PropertyRow label="Created by">
      {#if issue.creator}
        <span class="flex items-center gap-2 text-xs">
          <Avatar name={issue.creator.name} src={issue.creator.image} size={20} />
          <span class="truncate">{issue.creator.name}</span>
        </span>
      {:else}
        <span class="text-xs text-muted-foreground">—</span>
      {/if}
    </PropertyRow>
    <PropertyRow label="Created">
      <span class="text-xs">
        {DATE_TIME_MEDIUM_FORMAT.format(new Date(issue.createdAt))}
      </span>
    </PropertyRow>
    <PropertyRow label="Updated">
      <span class="text-xs">
        {DATE_TIME_MEDIUM_FORMAT.format(new Date(issue.updatedAt))}
      </span>
    </PropertyRow>
  </div>
{/snippet}

{#snippet sections()}
  <DescriptionEditor {issue} {mutations} readOnly={!canWrite} />
  <SectionSubIssues {issue} {mutations} />
  <SectionRelations {issue} {mutations} />
  <SectionSimilar {issue} {mutations} />
  <SectionAttachments {issue} {mutations} />
  <SectionCustomers {issue} {mutations} />
  <SectionPullRequests {issue} {mutations} />
  <SectionActivity {issue} {mutations} />
{/snippet}

{#if variant === 'page'}
  <div class="flex flex-col gap-5">
    {@render header()}
    {@render banner()}
    <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div class="flex min-w-0 flex-col gap-5">
        {@render titleField()}
        {@render sections()}
      </div>
      <aside aria-label="Properties" class="lg:border-l lg:border-border lg:pl-6">
        {@render properties()}
      </aside>
    </div>
  </div>
{:else}
  <div class="flex h-full flex-col gap-5">
    {@render header()}
    {@render banner()}
    {@render titleField()}
    <div class="border-y border-border py-3">{@render properties()}</div>
    {@render sections()}
  </div>
{/if}
