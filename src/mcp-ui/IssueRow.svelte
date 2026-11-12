<script lang="ts">
  import type { IssueDetail, IssueSummary } from '@/lib/server/mcp/contracts';
  import { toDateString } from '@/lib/dates';
  import { host } from './lib/app.svelte';
  import { dueTone, safeColor, shortDate } from './lib/model';
  import Avatar from './Avatar.svelte';
  import Chip from './Chip.svelte';
  import ExpandedIssue from './ExpandedIssue.svelte';
  import Icon from './Icon.svelte';
  import PriorityIcon from './PriorityIcon.svelte';
  import StateIcon from './StateIcon.svelte';

  interface Props {
    issue: IssueSummary;
    /** Show the project key in front of the title (lists across projects). */
    showProject?: boolean;
    /** The list is grouped by state: the group header says it, so the row leaves the state chip out. */
    hideState?: boolean;
    /** The row changed after a write in its expanded detail. */
    onchange?: (issue: IssueDetail) => void;
  }
  let { issue, showProject = false, hideState = false, onchange }: Props = $props();

  let open = $state(false);
  const today = toDateString(new Date());
  const closed = $derived(issue.state.type === 'completed' || issue.state.type === 'canceled');
  const followUpDue = $derived(issue.followUp != null && !closed && issue.followUp <= today);
  const locale = $derived(host.context.locale);

</script>

<li class="border-b border-line last:border-b-0">
  <button
    type="button"
    class="flex w-full items-start gap-2.5 rounded-viewsm px-1.5 py-2 text-left hover:bg-bg2"
    aria-expanded={open}
    aria-controls="row-{issue.id}"
    onclick={() => (open = !open)}
  >
    <span class="mt-0.5"><PriorityIcon priority={issue.priority} /></span>
    <span class="min-w-0 flex-1">
      <span class="flex min-w-0 items-baseline gap-2">
        <span class="shrink-0 font-code text-fg2">{issue.key}</span>
        <span class="line-clamp-2 min-w-0 font-medium [overflow-wrap:anywhere]">{issue.title}</span>
      </span>
      <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-fg2">
        {#if !hideState}
          <Chip tint={safeColor(issue.state.color)}><StateIcon type={issue.state.type} color={issue.state.color} size={12} /><span class="truncate">{issue.state.name}</span></Chip>
        {/if}
        {#if showProject}<span class="text-fg3">{issue.project.name}</span>{/if}
        {#each issue.labels.slice(0, 3) as label (label.id)}
          <Chip tint={safeColor(label.color)}><span class="truncate">{label.name}</span></Chip>
        {/each}
        {#if issue.labels.length > 3}<span class="text-fg3">+{issue.labels.length - 3}</span>{/if}
        {#if issue.dueDate}
          {@const tone = closed ? 'later' : dueTone(issue.dueDate, today)}
          <span class="inline-flex items-center gap-1 {tone === 'overdue' ? 'text-danger' : tone === 'soon' ? 'text-warn' : ''}"><Icon name="calendar" size={12} /><span class="sr-only-text">Due </span>{shortDate(issue.dueDate, locale, today)}</span>
        {/if}
        {#if issue.followUp}
          <span class="inline-flex items-center gap-1 {followUpDue ? 'text-warn' : ''}"><Icon name="clock" size={12} /><span class="sr-only-text">Follow up </span>{shortDate(issue.followUp, locale, today)}{#if followUpDue}<span> · due</span>{/if}</span>
        {/if}
        {#if issue.waitingOn}
          <span class="inline-flex min-w-0 items-center gap-1"><Icon name="wait" size={12} /><span class="truncate">waiting on {issue.waitingOn.name}</span></span>
        {/if}
      </span>
      {#if issue.snippet}
        <span class="mt-1 line-clamp-2 block text-fg2 [overflow-wrap:anywhere]">{issue.snippet}</span>
      {/if}
    </span>
    <span class="mt-0.5 flex shrink-0 items-center gap-1.5"><Avatar user={issue.assignee} size={20} /><Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} /></span>
  </button>

  {#if open}
    <div id="row-{issue.id}" class="mb-2 ml-7 border-l border-line pl-3">
      <ExpandedIssue issueKey={issue.key} {onchange} />
    </div>
  {/if}
</li>
