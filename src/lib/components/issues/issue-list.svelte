<!--
  Grouped issue list with drag-to-reorder / move between groups, collapsible
  (sub)group headers, j/k cursor, `s` status menu and Enter to open.
  Port of src/components/issues/issue-list.tsx (same props). GroupIcon is
  group-icon.svelte next to this file.
-->
<script lang="ts">
  import { DragDropManager } from '@dnd-kit/dom';
  import { DragDropProvider, DragOverlay, PointerSensor } from '@dnd-kit/svelte';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { onDestroy } from 'svelte';
  import type { Attachment } from 'svelte/attachments';
  import { SvelteSet } from 'svelte/reactivity';

  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { StateIcon } from '@/lib/components/ui-icons';
  import { useSortableGroups, type SortableContainer } from '@/lib/components/views/use-sortable-groups.svelte';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import { mergePatches, patchForNestedMove, type IssueGroup } from '@/lib/issue-grouping';
  import type { IssuePatch, IssueRow as Issue } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { useDisplayOptions } from './display-options.svelte';
  import DropList from './drop-list.svelte';
  import GroupIcon from './group-icon.svelte';
  import IssueRow from './issue-row.svelte';
  import SortableIssueRow from './sortable-issue-row.svelte';
  import { isPendingIssue, type IssueMutations } from './use-issue-mutations.svelte';

  interface Section {
    /** Unique across the list (group id, or group::subgroup). */
    key: string;
    group: IssueGroup;
    /** Set for second-level sections. */
    parent?: IssueGroup;
    /** Patch for "+" (group and subgroup combined). */
    createPatch: IssuePatch | null;
  }

  let {
    groups,
    mutations,
    selectedId,
    onSelect,
    onCreate,
  }: {
    /** With `subgroups` filled when sub-grouping is on. */
    groups: IssueGroup[];
    mutations: IssueMutations;
    selectedId?: string | null;
    onSelect?: (issue: Issue) => void;
    /** Group header "+" — receives the group's patch. */
    onCreate?: (patch: IssuePatch | null) => void;
  } = $props();

  // Pointer only: Space on a focused row belongs to peek preview (B6).
  // The manager is built here (with the sensors) so rows that register before
  // the provider's own sensor sync never get the default KeyboardSensor
  // (dnd-kit#2112); `sensors` is still passed so the provider keeps them.
  const sensors = [PointerSensor];
  const manager = new DragDropManager({ sensors });
  onDestroy(() => manager.destroy());

  const display = useDisplayOptions();
  const canWrite = useProjectPermission('write');
  let cursorId = $state<string | null>(null);
  let statusMenuFor = $state<string | null>(null);
  const collapsed = new SvelteSet<string>();
  // Last mounted row element per issue (focus target for j/k).
  const rowRefs = new Map<string, HTMLElement>();

  const sections: Section[] = $derived(
    groups.flatMap((group): Section[] => {
      if (!group.subgroups) return [{ key: group.id, group, createPatch: group.patch }];
      const subs = group.subgroups.filter((s) => display.current.showEmptyGroups || s.issues.length > 0);
      return [
        { key: group.id, group, createPatch: group.patch },
        ...subs.map((sub) => ({
          key: `${group.id}::${sub.id}`,
          group: sub,
          parent: group,
          createPatch: mergePatches(group.patch, sub.patch),
        })),
      ];
    }),
  );
  // Leaf sections hold the rows; a parent with subgroups only has a header.
  const leaves = $derived(sections.filter((s) => s.parent || !s.group.subgroups));
  const isHidden = (s: Section) => collapsed.has(s.parent?.id ?? '') || collapsed.has(s.key);

  const path = (s: Section) => (s.parent ? [s.parent, s.group] : [s.group]);
  const containers: SortableContainer[] = $derived(
    leaves.map((section) => ({
      id: section.key,
      issues: section.group.issues,
      patchFrom: (issue: Issue, fromId: string) => {
        const from = leaves.find((l) => l.key === fromId);
        return patchForNestedMove(issue, path(section), from ? path(from) : []);
      },
    })),
  );
  const sortable = useSortableGroups(() => ({
    containers,
    mutations,
    manual: display.current.orderBy === 'manual',
  }));

  const flat = $derived(leaves.filter((s) => !isHidden(s)).flatMap((s) => s.group.issues));

  /** Remember the row element (rowRefs in React: the last mounted one wins). */
  const registerRow =
    (id: string): Attachment<HTMLElement> =>
    (el) => {
      rowRefs.set(id, el);
      return () => {
        rowRefs.delete(id);
      };
    };

  const focusRow = (id: string) => {
    cursorId = id;
    rowRefs.get(id)?.focus();
  };

  const move = (delta: 1 | -1) => {
    if (flat.length === 0) return;
    const index = flat.findIndex((issue) => issue.id === cursorId);
    const next =
      index === -1 ? (delta === 1 ? 0 : flat.length - 1) : Math.min(flat.length - 1, Math.max(0, index + delta));
    focusRow(flat[next].id);
  };

  const openStatusMenu = () => {
    const focused = document.activeElement?.closest<HTMLElement>('[data-issue-row]');
    const id = focused?.dataset.issueRow ?? cursorId;
    if (id && flat.some((issue) => issue.id === id)) statusMenuFor = id;
  };

  const openFocused = () => {
    const focused = document.activeElement?.closest<HTMLElement>('[data-issue-row]');
    const issue = flat.find((i) => i.id === focused?.dataset.issueRow);
    if (issue && onSelect) onSelect(issue);
  };

  $effect(() =>
    registerHotkeys([
      { key: 'j', scope: 'Issues', description: 'Next issue', handler: () => move(1) },
      { key: 'k', scope: 'Issues', description: 'Previous issue', handler: () => move(-1) },
      {
        key: 's',
        scope: 'Issues',
        description: 'Change status of focused issue',
        handler: () => openStatusMenu(),
      },
    ]),
  );

  // Enter only means something once a detail view exists to open.
  const selectable = $derived(Boolean(onSelect));
  $effect(() => {
    if (!selectable) return;
    return registerHotkeys([
      {
        key: 'Enter',
        scope: 'Issues',
        description: 'Open focused issue',
        when: (event) => event.target instanceof HTMLElement && event.target.hasAttribute('data-issue-row'),
        handler: () => openFocused(),
      },
    ]);
  });

  const toggleCollapsed = (key: string) => {
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
  };

  const countOf = (group: IssueGroup) =>
    group.subgroups ? new Set(group.subgroups.flatMap((s) => s.issues.map((i) => i.id))).size : group.issues.length;
</script>

{#snippet header(section: Section)}
  {@const isCollapsed = collapsed.has(section.key)}
  <h2
    id={`group-${section.key}`}
    class={cn(
      'group/header sticky z-10 -mx-2 flex h-8 items-center gap-2 border-b border-border bg-background pr-4 text-xs font-medium text-muted-foreground',
      section.parent ? 'top-8 pl-9' : 'top-0 pl-2',
    )}
  >
    <button
      type="button"
      onclick={() => toggleCollapsed(section.key)}
      aria-expanded={!isCollapsed}
      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${section.group.label}`}
      class="flex size-5 items-center justify-center rounded outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRightIcon class={cn('size-3 transition-transform', !isCollapsed && 'rotate-90')} />
    </button>
    <GroupIcon group={section.group} />
    <span class="truncate text-foreground">{section.group.label}</span>
    <span class="tabular-nums">{countOf(section.group)}</span>
    {#if onCreate && section.createPatch && canWrite.current}
      <Button
        variant="ghost"
        size="icon-xs"
        class="ml-auto opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100"
        aria-label={`New ${section.group.label} issue`}
        onclick={() => onCreate(section.createPatch)}
      >
        <PlusIcon />
      </Button>
    {/if}
  </h2>
{/snippet}

<DragDropProvider {manager} {sensors} {...sortable.handlers}>
  <div data-issue-list data-dragging={sortable.dragging || undefined} class="flex flex-col">
    {#each sections as section (section.key)}
      {#if !(section.parent && collapsed.has(section.parent.id))}
        {@const showHeader = section.group.kind !== 'none'}
        {@const leaf = !section.group.subgroups}
        {@const items = leaf ? sortable.itemsOf(section.key) : []}
        <section aria-labelledby={showHeader ? `group-${section.key}` : undefined}>
          {#if showHeader}{@render header(section)}{/if}
          {#if leaf && !collapsed.has(section.key)}
            <DropList
              id={section.key}
              class={cn('flex flex-col py-1', items.length === 0 && sortable.dragging && 'min-h-9')}
            >
              {#each items as { id, issue }, index (id)}
                <SortableIssueRow {id} {index} group={section.key} disabled={!canWrite.current || isPendingIssue(issue)}>
                  {#snippet children(sortableAttach)}
                    <IssueRow
                      {@attach sortableAttach}
                      {@attach registerRow(issue.id)}
                      {issue}
                      active={issue.id === selectedId}
                      statusMenuOpen={statusMenuFor === issue.id}
                      onStatusMenuOpenChange={(open) => (statusMenuFor = open ? issue.id : null)}
                      onUpdate={(patch) => mutations.update(issue, patch)}
                      onFocus={() => (cursorId = issue.id)}
                      onSelect={onSelect ? () => onSelect(issue) : undefined}
                    />
                  {/snippet}
                </SortableIssueRow>
              {/each}
            </DropList>
          {/if}
        </section>
      {/if}
    {/each}
  </div>
  <DragOverlay dropAnimation={null}>
    {#snippet children(source)}
      {@const issue = sortable.issueOf(String(source.id))}
      {#if issue}
        <div
          class="flex h-9 items-center gap-3 rounded-md border border-border bg-background px-2 text-sm shadow-popover"
        >
          <StateIcon state={issue.state} size={14} />
          <span class="shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
          <span class="truncate">{issue.title}</span>
        </div>
      {/if}
    {/snippet}
  </DragOverlay>
</DragDropProvider>
