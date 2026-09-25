'use client';

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';

import { EmbedFrame } from './embed-frame';
import { embedFor } from './embeds';

export function EmbedNodeView({ node, selected }: ReactNodeViewProps) {
  const url = String(node.attrs.url ?? '');
  const embed = embedFor(url);
  return (
    <NodeViewWrapper contentEditable={false} data-drag-handle className="my-2">
      {embed ? (
        <EmbedFrame embed={embed} url={url} selected={selected} />
      ) : (
        <p className="text-sm text-muted-foreground">{url}</p>
      )}
    </NodeViewWrapper>
  );
}
