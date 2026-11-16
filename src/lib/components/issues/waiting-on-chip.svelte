<!-- "Waiting on Ana" — the member an issue is waiting on (nothing when no one). -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import HourglassIcon from '@lucide/svelte/icons/hourglass';

  import type { IssueUser } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';

  let { user, class: className }: { user: IssueUser | null; class?: string } = $props();
</script>

{#if user}
  <span
    title={m.issues_waiting_on_named({ name: user.name })}
    class={cn(
      'inline-flex h-5 max-w-36 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground',
      className,
    )}
  >
    <HourglassIcon class="size-3 shrink-0" aria-hidden="true" />
    <span class="sr-only">{m.issues_waiting_on()} </span>
    <span class="truncate">{user.name}</span>
  </span>
{/if}
