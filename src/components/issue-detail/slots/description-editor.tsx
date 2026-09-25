'use client';

// Owner: B1. Click-to-edit markdown description. Saves on blur / ⌘Enter / Esc
// through mutations.update (optimistic), then tells the server about newly
// @mentioned people so they're subscribed and notified.

import { useRef, useState, type MouseEvent } from 'react';

import { announceDescriptionMentions } from '@/app/actions/comments';
import { Markdown, MarkdownEditor } from '@/components/editor';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import type { IssueRow } from '@/lib/issue-model';
import { newMentionIds } from '@/lib/mentions';
import { useDraft } from '../use-draft';

export function DescriptionEditor({
  issue,
  mutations,
  readOnly = false,
}: {
  issue: IssueRow;
  mutations: IssueMutations;
  readOnly?: boolean;
}) {
  const saved = issue.description ?? '';
  const [draft, setDraft] = useDraft(saved);
  const [editing, setEditingState] = useState(false);
  // Blur, Esc and ⌘Enter can all fire while closing; commit once.
  const open = useRef(false);
  const setEditing = (value: boolean) => {
    open.current = value;
    setEditingState(value);
  };

  const commit = (next: string) => {
    const value = next.trim();
    if (value === saved) return;
    mutations.update(issue, { description: value || null });
    if (newMentionIds(saved, value).length > 0) {
      announceDescriptionMentions({
        projectId: issue.projectId,
        ticketId: issue.id,
        previous: saved,
        next: value,
      }).catch(() => {
        // Best effort: the description itself is saved by the update above.
      });
    }
  };

  const finish = () => {
    if (!open.current) return;
    setEditing(false);
    commit(draft);
  };

  if (editing && !readOnly) {
    return (
      <MarkdownEditor
        aria-label="Description"
        value={draft}
        onChange={setDraft}
        onSubmit={finish}
        onCancel={finish}
        onBlur={finish}
        placeholder="Add a description…"
        autoFocus
        textareaClassName="min-h-32"
      />
    );
  }

  const startEditing = (e: MouseEvent) => {
    // Links, task checkboxes and text selection keep their own behavior.
    if ((e.target as HTMLElement).closest('a, input, button')) return;
    if (window.getSelection()?.toString()) return;
    setEditing(true);
  };

  if (!saved) {
    if (readOnly) return <p className="px-1 text-sm text-muted-foreground">No description.</p>;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="min-h-16 rounded-md px-1 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40"
      >
        Add a description…
      </button>
    );
  }

  return (
    <div
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      aria-label={readOnly ? undefined : 'Edit description'}
      onClick={readOnly ? undefined : startEditing}
      onKeyDown={
        readOnly
          ? undefined
          : (e) => {
              if (e.key === 'Enter' && e.target === e.currentTarget) {
                e.preventDefault();
                setEditing(true);
              }
            }
      }
      className={readOnly ? 'px-1' : 'cursor-text rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/50'}
    >
      <Markdown onToggleTask={readOnly ? undefined : commit}>{saved}</Markdown>
    </div>
  );
}
