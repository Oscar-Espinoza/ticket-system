<!-- Outline property chip of the create dialogs Spread a picker trigger's `props` onto it. -->
<script lang="ts">
  import { Button, type ButtonProps } from '@/lib/components/ui/button';

  let { ref = $bindable(null), ...props }: ButtonProps = $props();
</script>

<Button
  bind:ref
  type="button"
  variant="outline"
  size="xs"
  class="max-w-48 font-normal text-muted-foreground aria-expanded:text-foreground"
  {...props}
/>
