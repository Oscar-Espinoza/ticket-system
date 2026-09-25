'use client';

// Glue between a synced collaborative doc and the markdown snapshot stored on
// the row (issue.description / document.content):
// - empty key → seed the Y.Doc from the markdown (server accepts one seed);
// - diverged → issue descriptions: the markdown wins when nobody else is in
//   the doc (API / Slack / raw-mode edits happened meanwhile); documents: the
//   collaborative state wins and the snapshot is re-saved;
// - local typing (never remote steps) saves the snapshot `delay` ms after it
//   stops, flushed on unmount — so N collaborators don't all save each change.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/react';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';

import { keepsText, normalizeParsed, tidyMarkdown } from '@/components/editor/markdown-io';
import { serializeMarkdown } from '@/components/editor/rich-editor';
import type { CollabProvider, CollabSnapshot } from '@/lib/collab/provider';

/** The markdown as the rich editor would store it, or null if it would lose text. */
function parseMarkdown(editor: Editor, markdown: string): { doc: JSONContent; normalized: string } | null {
  const manager = editor.markdown;
  if (!manager) return null;
  try {
    const doc = normalizeParsed(manager.parse(markdown));
    const normalized = tidyMarkdown(manager.serialize(doc));
    return keepsText(markdown, normalized) ? { doc, normalized } : null;
  } catch {
    return null;
  }
}

function seedUpdate(editor: Editor, doc: JSONContent): Uint8Array {
  const scratch = new Y.Doc();
  // 'default' is the Collaboration extension's fragment name.
  prosemirrorJSONToYXmlFragment(editor.schema, doc, scratch.getXmlFragment('default'));
  const update = Y.encodeStateAsUpdate(scratch);
  scratch.destroy();
  return update;
}

export type CollabEditorState = 'pending' | 'ready' | 'lossy';

export function useCollabEditor({
  provider,
  snapshot,
  editor,
  markdown,
  truth,
  hasPeers,
  onSave,
  delay = 1500,
}: {
  provider: CollabProvider | null;
  snapshot: CollabSnapshot;
  editor: Editor | null;
  /** The stored snapshot when the editor opened. */
  markdown: string;
  /** Which side wins when they differ on open. */
  truth: 'markdown' | 'collab';
  hasPeers: boolean;
  onSave: (markdown: string) => void;
  delay?: number;
}): { state: CollabEditorState; onChange: (markdown: string) => void } {
  const [state, setState] = useState<CollabEditorState>('pending');
  // Latest serialization from MarkdownEditor's onChange (it runs before our
  // update listener), so saves and the unmount flush don't serialize again.
  const latest = useRef<string | null>(null);
  // What the stored snapshot already says (as far as we know): opening a doc
  // or undoing back to it isn't a change worth saving. Remote steps reset it.
  const baseline = useRef<string | null>(null);
  const initFor = useRef<Editor | null>(null);
  const onSaveRef = useRef(onSave);
  const initial = useRef({ markdown, hasPeers, truth });
  useEffect(() => {
    onSaveRef.current = onSave;
    initial.current = { ...initial.current, hasPeers };
  });

  // Reconcile once per editor, after the first sync.
  useEffect(() => {
    if (!editor || !provider || !snapshot.synced || initFor.current === editor) return;
    initFor.current = editor;
    const { markdown: stored, truth: winner } = initial.current;

    const run = async () => {
      const text = stored.trim();
      const parsed = text ? parseMarkdown(editor, text) : null;
      if (snapshot.empty) {
        if (text) {
          if (!parsed) return 'lossy' as const;
          // Lost the race to another seeder → we caught up with theirs instead.
          if (snapshot.canWrite && !(await provider.seed(seedUpdate(editor, parsed.doc)))) return 'ready' as const;
        }
        baseline.current = parsed?.normalized ?? text;
        return 'ready' as const;
      }
      const current = serializeMarkdown(editor);
      const expected = parsed?.normalized ?? text;
      baseline.current = expected;
      if (current === expected) return 'ready' as const;
      if (winner === 'collab') {
        if (snapshot.canWrite) {
          baseline.current = current;
          onSaveRef.current(current);
        }
        return 'ready' as const;
      }
      if (text && !parsed) return 'lossy' as const;
      if (snapshot.canWrite && !initial.current.hasPeers) {
        // A local Yjs change like any other: the others receive it too.
        if (parsed) editor.commands.setContent(parsed.doc);
        else editor.commands.clearContent(true);
      }
      return 'ready' as const;
    };

    // Not cancelled when deps change (seeding flips `empty`); only a new editor matters.
    void run()
      .catch(() => 'ready' as const)
      .then((result) => {
        if (initFor.current === editor && !editor.isDestroyed) setState(result);
      });
  }, [editor, provider, snapshot.synced, snapshot.empty, snapshot.canWrite]);

  // Debounced snapshot saves from local changes only (typing during a seed
  // counts; the seed itself and remote steps don't).
  const lossy = state === 'lossy';
  useEffect(() => {
    if (!editor || lossy || !snapshot.canWrite) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      timer = null;
      const value = latest.current ?? (editor.isDestroyed ? null : serializeMarkdown(editor));
      if (value === null || value === baseline.current) return;
      baseline.current = value;
      onSaveRef.current(value);
    };
    const flush = () => {
      if (timer === null) return;
      clearTimeout(timer);
      save();
    };
    const onUpdate = ({ transaction }: { transaction: Parameters<typeof isChangeOrigin>[0] }) => {
      if (isChangeOrigin(transaction)) {
        baseline.current = null;
        return;
      }
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(save, delay);
    };
    editor.on('update', onUpdate);
    window.addEventListener('pagehide', flush);
    return () => {
      editor.off('update', onUpdate);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [editor, lossy, snapshot.canWrite, delay]);

  const onChange = useCallback((value: string) => {
    latest.current = value;
  }, []);
  return { state, onChange };
}
