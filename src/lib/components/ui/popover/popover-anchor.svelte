<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { createAttachmentKey, type Attachment } from 'svelte/attachments';
  import { getPopoverAnchorContext } from './popover-context.svelte';

  type AnchorProps = Record<string, unknown>;
  type Props = HTMLAttributes<HTMLDivElement> & {
    ref?: HTMLElement | null;
    /** Radix `asChild`: render your own element and spread `props` on it. */
    child?: Snippet<[{ props: AnchorProps }]>;
  };

  let { ref = $bindable(null), child, children, ...restProps }: Props = $props();

  const anchor = getPopoverAnchorContext();

  const register: Attachment<HTMLElement> = (node) => {
    ref = node;
    if (anchor) anchor.element = node;
    return () => {
      if (anchor && anchor.element === node) anchor.element = null;
      if (ref === node) ref = null;
    };
  };

  const attachmentKey = createAttachmentKey();
  const anchorProps: AnchorProps = $derived({
    ...restProps,
    'data-slot': 'popover-anchor',
    [attachmentKey]: register,
  });
</script>

{#if child}
  {@render child({ props: anchorProps })}
{:else}
  <div {...anchorProps}>{@render children?.()}</div>
{/if}
