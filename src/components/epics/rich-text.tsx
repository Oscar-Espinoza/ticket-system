'use client';

// Markdown for epic / initiative descriptions and epic updates — a thin adapter
// over the shared editor (B1): safe renderer (no raw HTML) + the markdown
// editor with toolbar, preview, @mentions, ⌘Enter / Esc.

import { Markdown, MarkdownEditor } from '@/components/editor';

export function RichText({ source, className }: { source: string; className?: string }) {
  return <Markdown className={className}>{source}</Markdown>;
}

export function RichTextEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  autoFocus,
  maxLength,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  /** ⌘/Ctrl+Enter. */
  onSubmit?: () => void;
  /** Esc. */
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
  className?: string;
  'aria-label': string;
}) {
  return (
    <MarkdownEditor
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
      placeholder={placeholder}
      autoFocus={autoFocus}
      maxLength={maxLength}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
