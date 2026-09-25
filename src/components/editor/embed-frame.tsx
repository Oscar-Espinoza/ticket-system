'use client';

// Sandboxed provider iframe with a quiet caption, shared by the editor's embed
// node view and the markdown renderer.

import { ExternalLink } from 'lucide-react';

import { cn } from '@/lib/utils';
import { EMBED_ALLOW, EMBED_SANDBOX, type Embed } from './embeds';

export function EmbedFrame({
  embed,
  url,
  selected,
  className,
}: {
  embed: Embed;
  /** The original link, for "Open". */
  url: string;
  selected?: boolean;
  className?: string;
}) {
  return (
    <figure
      className={cn(
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
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ aspectRatio: embed.aspect }}
        className="block max-h-[70vh] w-full border-0 bg-background"
      />
      <figcaption className="flex items-center gap-2 border-t border-border px-2.5 py-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">{embed.label}</span>
        <span className="min-w-0 flex-1 truncate">{url}</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex shrink-0 items-center gap-1 rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ExternalLink className="size-3" aria-hidden />
          Open
        </a>
      </figcaption>
    </figure>
  );
}
