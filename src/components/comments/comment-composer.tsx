'use client';

import { useState } from 'react';

import { MarkdownEditor } from '@/components/editor';
import { Button } from '@/components/ui/button';
import { COMMENT_MAX_LENGTH } from '@/lib/timeline';

/**
 * Comment / reply / edit box. `onSubmit` resolves false on failure, which
 * restores the text so nothing typed is lost.
 */
export function CommentComposer({
  initialValue = '',
  placeholder = 'Leave a comment…',
  submitLabel = 'Comment',
  autoFocus,
  onSubmit,
  onCancel,
}: {
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<boolean> | boolean;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initialValue);
  const [pending, setPending] = useState(false);
  const empty = !draft.trim();

  async function submit() {
    const body = draft.trim();
    if (!body || pending) return;
    setPending(true);
    setDraft('');
    const ok = await onSubmit(body);
    setPending(false);
    if (!ok) setDraft(body);
  }

  return (
    <MarkdownEditor
      aria-label={placeholder.replace(/…$/, '')}
      value={draft}
      onChange={setDraft}
      onSubmit={submit}
      onCancel={onCancel}
      placeholder={placeholder}
      autoFocus={autoFocus}
      maxLength={COMMENT_MAX_LENGTH}
      textareaClassName="min-h-12"
      actions={
        <>
          {onCancel && (
            <Button type="button" size="xs" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            size="xs"
            disabled={empty || pending}
            title="Submit (⌘Enter)"
            onClick={submit}
          >
            {submitLabel}
          </Button>
        </>
      }
    />
  );
}
