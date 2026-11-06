<!-- Ghost "property" trigger of the epic / initiative sidebars Spread a picker trigger's `props` onto it. -->
<script lang="ts">
  import { Button, type ButtonProps } from '@/lib/components/ui/button';
  import { cn } from '@/lib/utils';

  let { class: className, ref = $bindable(null), ...props }: ButtonProps = $props();
</script>

<Button
  bind:ref
  variant="ghost"
  size="sm"
  class={cn('-ml-2 max-w-full gap-2 font-normal', className)}
  {...props}
/>
