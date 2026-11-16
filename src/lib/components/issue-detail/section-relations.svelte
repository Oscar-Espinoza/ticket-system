<!--
  Blocks / blocked by / related / duplicate. Relations aren't part
  of IssueRow, so they're fetched per issue; adds/removes apply locally first
  and then resync from the server.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { toast } from 'svelte-sonner';

  import { actionErrorText } from '@/lib/action-errors';
  import { addIssueRelation, getIssueRelations, removeIssueRelation } from '@/lib/actions/relations';
  import IssueRefRow from '@/lib/components/issue-hierarchy/issue-ref-row.svelte';
  import SectionHeader from '@/lib/components/issue-hierarchy/section-header.svelte';
  import PickerPopover from '@/lib/components/issue-pickers/picker-popover.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import type { IssueRow } from '@/lib/issue-model';
  import type { AddableRelationKind, IssueRelationView } from '@/lib/relations';
  import { cn } from '@/lib/utils';
  import AddRelation from './add-relation.svelte';
  import { GROUP_ORDER, KINDS } from './relation-kinds';

  let { issue, mutations }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  let relations = $state.raw<IssueRelationView[] | null>(null);
  let version = $state(0);
  let adding = $state(false);
  // Relations added elsewhere (e.g. "Mark as duplicate" in Similar issues)
  // bump the issue's updatedAt; refetch when it changes.
  const updatedStamp = $derived(new Date(issue.updatedAt).getTime());

  $effect(() => {
    const projectId = issue.projectId;
    const ticketId = issue.id;
    void version;
    void updatedStamp;
    let cancelled = false;
    getIssueRelations({ projectId, ticketId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) relations = result.relations;
        else relations = [];
      })
      .catch(() => {
        if (!cancelled) relations = relations ?? [];
      });
    return () => {
      cancelled = true;
    };
  });

  const resync = () => (version += 1);

  async function add(kind: AddableRelationKind, other: IssueRow) {
    relations = [...(relations ?? []), { id: `temp-${other.id}`, kind, issue: other }];
    try {
      const result = await addIssueRelation({
        projectId: issue.projectId,
        ticketId: issue.id,
        relatedTicketId: other.id,
        kind,
      });
      if (!result.ok) toast.error(actionErrorText(result.error));
      else if (result.warning) toast.warning(result.warning);
      else if (kind === 'duplicate_of') toast.success(m.issues_relations_marked_duplicate({ key: issue.key, other: other.key }));
    } catch {
      toast.error(m.issues_relations_save_failed());
    }
    resync();
  }

  async function remove(relation: IssueRelationView) {
    relations = relations?.filter((r) => r.id !== relation.id) ?? null;
    try {
      const result = await removeIssueRelation({ projectId: issue.projectId, relationId: relation.id });
      if (!result.ok) toast.error(actionErrorText(result.error));
    } catch {
      toast.error(m.issues_relations_remove_failed());
    }
    resync();
  }

  const list = $derived(relations ?? []);

  // The list's copy of a related issue is fresher (optimistic state changes).
  const fresh = (other: IssueRow) => mutations.issues.find((i) => i.id === other.id) ?? other;
</script>

{#if list.length > 0 || canWrite}
  <section aria-label={m.issues_relations()} class="flex flex-col gap-1">
    <SectionHeader title={m.issues_relations()}>
      {#if canWrite}
        <PickerPopover bind:open={adding} align="end" class="w-80">
          {#snippet content(close)}
            <AddRelation
              {issue}
              candidates={mutations.issues}
              relations={list}
              onAdd={(kind, other) => {
                close();
                void add(kind, other);
              }}
            />
          {/snippet}
          {#snippet children({ props })}
            <Button {...props} variant="ghost" size="icon-xs" aria-label={m.issues_relations_add()} title={m.issues_relations_add()}>
              <PlusIcon />
            </Button>
          {/snippet}
        </PickerPopover>
      {/if}
    </SectionHeader>

    {#each GROUP_ORDER as kind (kind)}
      {@const group = list.filter((r) => r.kind === kind)}
      {#if group.length > 0}
        {@const Icon = KINDS[kind].icon}
        <div class="flex flex-col">
          <div class="flex items-center gap-1.5 px-1.5 pt-1 text-xs text-muted-foreground">
            <Icon class={cn('size-3', KINDS[kind].iconClass)} />
            {KINDS[kind].group}
          </div>
          {#each group as relation (relation.id)}
            <IssueRefRow
              issue={fresh(relation.issue)}
              removeLabel={m.issues_relations_remove()}
              class={relation.id.startsWith('temp-') ? 'opacity-60' : undefined}
              onRemove={canWrite && !relation.id.startsWith('temp-') ? () => void remove(relation) : undefined}
            />
          {/each}
        </div>
      {/if}
    {/each}

    {#if canWrite && relations !== null && list.length === 0}
      <Button variant="ghost" size="sm" class="w-fit gap-2 font-normal text-muted-foreground" onclick={() => (adding = true)}>
        <PlusIcon />
        {m.issues_relations_add()}
      </Button>
    {/if}
  </section>
{/if}
