<!-- Relative time with the absolute date in a tooltip. Needs a TooltipProvider above. -->
<script module lang="ts">
  const absolute = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<script lang="ts">
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/lib/components/ui/tooltip';
  import { relativeTime } from './relative-time';

  let { date }: { date: Date } = $props();

  const value = $derived(new Date(date));
</script>

<Tooltip>
  <TooltipTrigger>
    {#snippet child({ props })}
      <!-- bits' trigger props carry tabindex=0; Radix asChild left <time> unfocusable, so drop it. -->
      <time {...props} tabindex={undefined} datetime={value.toISOString()} class="cursor-default whitespace-nowrap">
        {relativeTime(value)}
      </time>
    {/snippet}
  </TooltipTrigger>
  <TooltipContent>{absolute.format(value)}</TooltipContent>
</Tooltip>
