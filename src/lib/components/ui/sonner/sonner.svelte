<script lang="ts">
  import { mode } from 'mode-watcher';
  import { Toaster as Sonner, type ToasterProps } from 'svelte-sonner';
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import InfoIcon from '@lucide/svelte/icons/info';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
  import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
  // lucide's Loader2Icon is an alias of loader-circle (same glyph).
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  let { ...restProps }: ToasterProps = $props();
</script>

<!--
  React read next-themes' `theme` (default "system"); mode-watcher's resolved
  mode is the same light/dark result, and is undefined during SSR.
-->
<Sonner
  theme={mode.current ?? 'system'}
  class="toaster group"
  style="--normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border); --border-radius: var(--radius);"
  toastOptions={{
    classes: {
      toast: 'cn-toast',
    },
  }}
  {...restProps}
>
  {#snippet successIcon()}
    <CircleCheckIcon class="size-4" />
  {/snippet}
  {#snippet infoIcon()}
    <InfoIcon class="size-4" />
  {/snippet}
  {#snippet warningIcon()}
    <TriangleAlertIcon class="size-4" />
  {/snippet}
  {#snippet errorIcon()}
    <OctagonXIcon class="size-4" />
  {/snippet}
  {#snippet loadingIcon()}
    <Loader2Icon class="size-4 animate-spin" />
  {/snippet}
</Sonner>
