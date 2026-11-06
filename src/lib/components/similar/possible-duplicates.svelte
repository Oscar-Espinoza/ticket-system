<!--
  "Possible duplicates" hint under the new-issue title: up to three similar
  issues, each opening in a new tab so the draft stays put.
-->
<script lang="ts">
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

  import { StateIcon } from '@/lib/components/ui-icons';
  import { issuePath } from '@/lib/issue-links';
  import { cn } from '@/lib/utils';
  import { isClosed } from '@/lib/workflow';
  import { usePossibleDuplicates } from './use-possible-duplicates.svelte';

  let {
    projectId,
    title,
    enabled,
    class: className,
  }: {
    projectId: string;
    title: string;
    /** False while the dialog is closed or the viewer can't create issues. */
    enabled: boolean;
    class?: string;
  } = $props();

  const similar = usePossibleDuplicates(
    () => projectId,
    () => title,
    () => enabled,
  );
</script>

{#if similar.current.length > 0}
  <section
    aria-label="Possible duplicates"
    aria-live="polite"
    class={cn('flex flex-col gap-0.5 rounded-md border border-dashed border-border px-2 py-1.5', className)}
  >
    <h3 class="px-1 text-xs text-muted-foreground">Possible duplicates</h3>
    <ul class="flex flex-col">
      {#each similar.current as { issue, reason } (issue.id)}
        <li>
          <a
            href={issuePath(issue.projectId, issue.key)}
            target="_blank"
            rel="noopener noreferrer"
            title={`${reason} — opens in a new tab`}
            class="group/dup flex h-7 items-center gap-2 rounded-sm px-1 text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <StateIcon state={issue.state} size={14} />
            <span class="shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
            <span
              class={cn(
                'min-w-0 flex-1 truncate',
                isClosed(issue.state.type) && 'text-muted-foreground',
              )}
            >
              {issue.title}
            </span>
            <span class="shrink-0 text-xs text-muted-foreground">{issue.state.name}</span>
            <ExternalLinkIcon
              class="size-3 shrink-0 text-muted-foreground opacity-0 group-hover/dup:opacity-100 group-focus-visible/dup:opacity-100"
            />
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}
