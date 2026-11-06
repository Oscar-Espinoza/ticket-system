<!-- One formatting button of MarkdownEditor's toolbar. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { cn } from '@/lib/utils';

  let {
    label,
    title,
    shortcut,
    pressed,
    disabled,
    onClick,
    children,
  }: {
    label: string;
    title?: string;
    shortcut?: string;
    pressed?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children?: Snippet;
  } = $props();
</script>

<!-- mousedown preventDefault keeps focus + selection in the editor. -->
<button
  type="button"
  aria-label={label}
  aria-pressed={pressed}
  title={title ?? (shortcut ? `${label} (⌘${shortcut})` : label)}
  {disabled}
  onmousedown={(e) => e.preventDefault()}
  onclick={onClick}
  class={cn(
    'flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none [&_svg]:size-3.5',
    pressed && 'bg-muted text-foreground',
  )}
>
  {@render children?.()}
</button>
