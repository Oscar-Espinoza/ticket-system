<!--
  "Move to project" submenu in the issue … menu. Targets load when
  the submenu first opens; picking one moves the issue (and its sub-issues) and
  navigates to its new permalink. The menu unmounts on select; the move and the
  navigation carry on.
-->
<script module lang="ts">
  import { toast } from 'svelte-sonner';

  import { moveIssueToProject, type MoveTarget } from '@/lib/actions/move';
  import { issuePath } from '@/lib/issue-links';
  import type { IssueRow } from '@/lib/issue-model';

  type Targets = MoveTarget[] | 'loading' | { error: string } | null;

  async function move(issue: IssueRow, target: MoveTarget, navigate: (href: string) => void) {
    const pending = toast.loading(`Moving ${issue.key} to ${target.name}…`);
    const result = await moveIssueToProject({
      projectId: issue.projectId,
      id: issue.id,
      toProjectId: target.id,
    });
    if (!result.ok) {
      toast.error(actionErrorText(result.error, "You don't have permission to do that."), {
        id: pending,
      });
      return;
    }
    const extra = [
      result.moved > 1 && `with ${pluralize(result.moved - 1, 'sub-issue')}`,
      result.droppedLabels.length > 0 && `dropped labels: ${result.droppedLabels.join(', ')}`,
    ].filter(Boolean);
    toast.success(`Moved ${result.fromKey} → ${result.key}`, {
      id: pending,
      description: extra.length ? extra.join(' · ') : undefined,
    });
    navigate(issuePath(result.projectId, result.key));
  }
</script>

<script lang="ts">
  import { pluralize } from '@/lib/format';
  import ArrowRightLeftIcon from '@lucide/svelte/icons/arrow-right-left';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { goto } from '$app/navigation';

  import { actionErrorText } from '@/lib/action-errors';
  import { listMoveTargets } from '@/lib/actions/move';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import {
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
  } from '@/lib/components/ui/dropdown-menu';

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const canWrite = useProjectPermission('write');
  let targets = $state.raw<Targets>(null);

  async function load() {
    // Load once; retry after an error.
    if (targets === 'loading' || Array.isArray(targets)) return;
    targets = 'loading';
    const result = await listMoveTargets(issue.projectId);
    targets = result.ok ? result.projects : { error: result.error };
  }
</script>

{#if canWrite.current && !issue.deletedAt}
  <DropdownMenuSub onOpenChange={(open) => open && void load()}>
    <DropdownMenuSubTrigger>
      <ArrowRightLeftIcon />
      Move to project
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent class="max-h-72 w-56 overflow-y-auto">
      {#if targets === null || targets === 'loading'}
        <DropdownMenuItem disabled>
          <Loader2Icon class="animate-spin" />
          Loading projects…
        </DropdownMenuItem>
      {:else if !Array.isArray(targets)}
        <DropdownMenuItem disabled>Couldn’t load projects.</DropdownMenuItem>
      {:else if targets.length === 0}
        <DropdownMenuItem disabled>No other projects you can write to.</DropdownMenuItem>
      {:else}
        {#each targets as target (target.id)}
          <DropdownMenuItem onSelect={() => void move(issue, target, (href) => void goto(href))}>
            <span class="w-12 shrink-0 font-mono text-xs text-muted-foreground">
              {target.ticketKey}
            </span>
            <span class="truncate">{target.name}</span>
          </DropdownMenuItem>
        {/each}
      {/if}
    </DropdownMenuSubContent>
  </DropdownMenuSub>
{/if}
