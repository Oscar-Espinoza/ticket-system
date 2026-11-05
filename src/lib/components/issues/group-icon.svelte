<!--
  Glyph for a group header: state icon, priority icon, avatar or color dot.
  Port of GroupIcon from src/components/issues/issue-list.tsx (board headers use it too).
-->
<script lang="ts">
  import UserRoundIcon from '@lucide/svelte/icons/user-round';

  import { Avatar, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import type { IssueGroup } from '@/lib/issue-grouping';

  let { group }: { group: IssueGroup } = $props();
</script>

{#if group.state}
  <StateIcon state={group.state} size={14} />
{:else if group.priority}
  <PriorityIcon priority={group.priority} size={14} />
{:else if group.kind === 'assignee'}
  {#if group.user}
    <Avatar name={group.user.name} src={group.user.image} size={20} />
  {:else}
    <UserRoundIcon class="size-4 text-muted-foreground/60" aria-hidden="true" />
  {/if}
{:else if group.color}
  <span aria-hidden="true" class="size-2 shrink-0 rounded-full" style:background-color={group.color}></span>
{/if}
