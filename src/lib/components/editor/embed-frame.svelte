<!--
  Sandboxed provider iframe with a quiet caption, shared by the editor's embed
  node view and the markdown renderer. Port of src/components/editor/embed-frame.tsx.
-->
<script lang="ts">
  import ExternalLink from '@lucide/svelte/icons/external-link';

  import { cn } from '@/lib/utils';
  import { EMBED_ALLOW, EMBED_SANDBOX, type Embed } from '@/components/editor/embeds';

  let {
    embed,
    url,
    selected,
    class: className,
  }: {
    embed: Embed;
    /** The original link, for "Open". */
    url: string;
    selected?: boolean;
    class?: string;
  } = $props();
</script>

<figure
  class={cn(
    'my-1 overflow-hidden rounded-lg border border-border bg-muted/30',
    selected && 'ring-2 ring-ring/60',
    className,
  )}
>
  <iframe
    src={embed.src}
    title={`${embed.label} embed`}
    sandbox={EMBED_SANDBOX}
    allow={EMBED_ALLOW}
    allowfullscreen
    loading="lazy"
    referrerpolicy="strict-origin-when-cross-origin"
    style:aspect-ratio={embed.aspect}
    class="block max-h-[70vh] w-full border-0 bg-background"
  ></iframe>
  <figcaption class="flex items-center gap-2 border-t border-border px-2.5 py-1 text-xs text-muted-foreground">
    <span class="font-medium text-foreground/80">{embed.label}</span>
    <span class="min-w-0 flex-1 truncate">{url}</span>
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      class="inline-flex shrink-0 items-center gap-1 rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <ExternalLink class="size-3" aria-hidden="true" />
      Open
    </a>
  </figcaption>
</figure>
