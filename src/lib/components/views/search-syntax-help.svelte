<!--
  "?" popover listing the query syntax (lib/issue-filtering SEARCH_SYNTAX_HELP).
  Clicking an example hands it to `onInsert` (appended to the query box).
  The file's `appendToken` helper is exported from this module:
    import SearchSyntaxHelp, { appendToken } from '@/lib/components/views/search-syntax-help.svelte';
-->
<script module lang="ts">
  /** Appends `token` to `query` with a separating space. */
  export function appendToken(query: string, token: string): string {
    const base = query.trimEnd();
    return base ? `${base} ${token} ` : `${token} `;
  }
</script>

<script lang="ts">
  import CircleHelpIcon from '@lucide/svelte/icons/circle-question-mark';

  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import { SEARCH_SYNTAX_HELP } from '@/lib/issue-filtering';
  import { cn } from '@/lib/utils';

  let {
    onInsert,
    class: className,
    note,
  }: {
    onInsert?: (token: string) => void;
    class?: string;
    /** Extra line under the heading (e.g. what free text matches here). */
    note?: string;
  } = $props();
</script>

<Popover>
  <PopoverTrigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        aria-label="Search syntax"
        title="Search syntax"
        class={cn(
          'flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <CircleHelpIcon class="size-3.5" aria-hidden="true" />
      </button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent align="start" class="w-[22rem] gap-0 p-0">
    <div class="border-b border-border px-3 py-2">
      <p class="text-sm font-medium">Search syntax</p>
      <p class="text-xs text-muted-foreground">
        {note ?? 'Combine filters with free text.'} Quote values with spaces, separate
        alternatives with commas, prefix with - to exclude.
      </p>
    </div>
    <dl class="max-h-80 overflow-y-auto px-1 py-1 text-xs">
      {#each SEARCH_SYNTAX_HELP as entry (entry.key)}
        <div class="grid grid-cols-[4.5rem_1fr] items-start gap-2 rounded px-2 py-1">
          <dt class="pt-0.5 font-mono text-muted-foreground">{entry.key}:</dt>
          <dd class="flex min-w-0 flex-col gap-1">
            <span class="text-muted-foreground">{entry.description}</span>
            <span class="flex flex-wrap gap-1">
              {#each entry.examples as example (example)}
                {#if onInsert}
                  <button
                    type="button"
                    onclick={() => onInsert(example)}
                    class="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {example}
                  </button>
                {:else}
                  <code class="rounded bg-muted px-1.5 py-0.5">{example}</code>
                {/if}
              {/each}
            </span>
          </dd>
        </div>
      {/each}
    </dl>
  </PopoverContent>
</Popover>
