<!-- Relative time with the absolute date in a tooltip. Needs a TooltipProvider above. -->

<script lang="ts">
  import { DATE_TIME_MEDIUM_FORMAT } from '@/lib/format';
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/lib/components/ui/tooltip';
  import { relativeTime } from '@/lib/relative-time';

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
  <TooltipContent>{DATE_TIME_MEDIUM_FORMAT.format(value)}</TooltipContent>
</Tooltip>
