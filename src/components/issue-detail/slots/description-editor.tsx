'use client';

// Owner: B1 (editor swap: D1, collaboration: D2). Click-to-edit description in
// the WYSIWYG editor. While open it's a shared Yjs document (key
// `issue:<id>`, relayed through /api/collab): teammates' text and carets show
// live, and the markdown is saved back through mutations.update 1.5 s after
// local typing stops (and on close), so activity and notifications see one
// change per pause, not per keystroke. Newly @mentioned people are announced.
// Falls back to the single-user editor (save on blur / ⌘Enter / Esc) when the
// collab API is unreachable, for just-created issues, and for descriptions the
// rich editor can't represent (tables, raw HTML → raw Markdown mode).

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { Editor } from '@tiptap/react';

import { announceDescriptionMentions } from '@/app/actions/comments';
import { CollabAvatars, CollabStatusBadge } from '@/components/collab/collab-avatars';
import { collabColor, useCollab, useCollabPeers } from '@/components/collab/use-collab';
import { useCollabEditor } from '@/components/collab/use-collab-editor';
import { Markdown, MarkdownEditor } from '@/components/editor';
import { useProjectData } from '@/components/project/project-data';
import { isPendingIssue, type IssueMutations } from '@/components/issues/use-issue-mutations';
import { issueCollabKey } from '@/lib/collab/codec';
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
  // Collaboration unavailable (API down / content it can't hold) for this issue.
  const [singleUser, setSingleUser] = useState<string | null>(null);
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

  // The collaborative editor saves as you type (and flushes on unmount).
  const close = () => {
    if (open.current) setEditing(false);
  };

  if (editing && !readOnly) {
    if (singleUser !== issue.id && !isPendingIssue(issue)) {
      return (
        <CollaborativeDescription
          key={issue.id}
          issue={issue}
          saved={saved}
          onSave={commit}
          onClose={close}
          onUnavailable={() => setSingleUser(issue.id)}
        />
      );
    }
    return (
      <MarkdownEditor
        aria-label="Description"
        value={draft}
        onChange={setDraft}
        onSubmit={finish}
        onCancel={finish}
        onBlur={finish}
        placeholder="Add a description… (type / for commands)"
        autoFocus
        projectId={issue.projectId}
        // A just-created issue has no server id to attach images to yet.
        ticketId={isPendingIssue(issue) ? undefined : issue.id}
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

function CollaborativeDescription({
  issue,
  saved,
  onSave,
  onClose,
  onUnavailable,
}: {
  issue: IssueRow;
  saved: string;
  onSave: (markdown: string) => void;
  onClose: () => void;
  onUnavailable: () => void;
}) {
  const { viewer } = useProjectData();
  const user = useMemo(
    () => ({ id: viewer.id, name: viewer.name, image: viewer.image, color: collabColor(viewer.id) }),
    [viewer.id, viewer.name, viewer.image],
  );
  const { provider, extensions, snapshot } = useCollab(issueCollabKey(issue.id), user);
  const peers = useCollabPeers(provider, viewer.id);
  const [editor, setEditor] = useState<Editor | null>(null);
  const onEditor = useCallback((instance: Editor | null) => setEditor(instance), []);
  const { state, onChange } = useCollabEditor({
    provider,
    snapshot,
    editor,
    markdown: saved,
    truth: 'markdown',
    hasPeers: peers.length > 0,
    onSave,
  });

  const unavailable = state === 'lossy' || (snapshot.status === 'error' && !snapshot.synced);
  useEffect(() => {
    if (unavailable) onUnavailable();
  }, [unavailable, onUnavailable]);

  // The editor mounts hidden (its schema seeds / checks the doc) and shows
  // once reconciled, so the text never flashes empty; focus then.
  const ready = state === 'ready';
  useEffect(() => {
    if (ready && editor && !editor.isDestroyed) editor.commands.focus('end');
  }, [ready, editor]);

  return (
    <div className="flex flex-col gap-1">
      {ready && (peers.length > 0 || snapshot.status !== 'synced') && (
        <div className="flex min-h-5 items-center justify-end gap-2">
          <CollabStatusBadge snapshot={snapshot} />
          <CollabAvatars peers={peers} />
        </div>
      )}
      {!ready && (
        <div aria-busy="true" className="flex min-h-32 flex-col gap-1 rounded-lg border border-input px-2.5 py-2 dark:bg-input/30">
          <CollabStatusBadge snapshot={snapshot} />
          {saved && (
            <div className="opacity-70">
              <Markdown>{saved}</Markdown>
            </div>
          )}
        </div>
      )}
      {snapshot.synced && extensions && (
        <div hidden={!ready}>
          <MarkdownEditor
            aria-label="Description"
            value={saved}
            onChange={onChange}
            controlled={false}
            history={false}
            extensions={extensions}
            onEditor={onEditor}
            onSubmit={onClose}
            onCancel={onClose}
            onBlur={onClose}
            disabled={!snapshot.canWrite}
            placeholder="Add a description… (type / for commands)"
            projectId={issue.projectId}
            ticketId={issue.id}
            textareaClassName="min-h-32"
          />
        </div>
      )}
    </div>
  );
}
