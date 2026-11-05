<script lang="ts">
  import { Progress as ProgressPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
  import { cn } from '@/lib/utils';

  let {
    ref = $bindable(null),
    class: className,
    value,
    ...restProps
  }: WithoutChildrenOrChild<ProgressPrimitive.RootProps> = $props();
</script>

<ProgressPrimitive.Root
  bind:ref
  data-slot="progress"
  value={value ?? null}
  class={cn('relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted', className)}
  {...restProps}
>
  <!-- bits has no Indicator part; this div is Radix's Progress.Indicator. -->
  <div
    data-slot="progress-indicator"
    data-state={value == null ? 'indeterminate' : value >= (restProps.max ?? 100) ? 'complete' : 'loading'}
    data-value={value ?? undefined}
    data-max={restProps.max ?? 100}
    class="size-full flex-1 bg-primary transition-all"
    style="transform: translateX(-{100 - (value || 0)}%)"
  ></div>
</ProgressPrimitive.Root>
