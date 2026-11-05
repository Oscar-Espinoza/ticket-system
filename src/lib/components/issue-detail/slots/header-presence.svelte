<!--
  Owner: B12. Avatars of the other members viewing this issue right now
  (presence heartbeat, see project/slots/live-updates). Renders nothing
  when you're alone.
-->
<script module lang="ts">
  const MAX_AVATARS = 3;

  function names(list: string[]): string {
    if (list.length <= 2) return list.join(' and ');
    return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  }
</script>

<script lang="ts">
  import { Avatar } from '@/lib/components/ui-icons';
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/lib/components/ui/tooltip';
  import { useProjectPresence } from '@/lib/components/project/slots/live-updates.svelte.ts';
  import { isPendingIssue, type IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import type { IssueRow } from '@/lib/issue-model';

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const pending = $derived(isPendingIssue(issue));
  const everyone = useProjectPresence(
    () => issue.projectId,
    () => (pending ? null : issue.id),
  );
  const viewers = $derived(pending ? [] : everyone.current.filter((u) => u.ticketId === issue.id));
  const label = $derived(
    `${names(viewers.map((v) => v.name))} ${viewers.length === 1 ? 'is' : 'are'} also viewing`,
  );
  const extra = $derived(viewers.length - MAX_AVATARS);
</script>

{#if viewers.length > 0}
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger>
        {#snippet child({ props })}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            {...props}
            role="img"
            tabindex={0}
            aria-label={label}
            class="mr-1 flex items-center -space-x-1.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {#each viewers.slice(0, MAX_AVATARS) as v (v.id)}
              <Avatar name={v.name} src={v.image} size={20} class="ring-2 ring-background" />
            {/each}
            {#if extra > 0}
              <span class="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground ring-2 ring-background">
                +{extra}
              </span>
            {/if}
          </div>
        {/snippet}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
{/if}
