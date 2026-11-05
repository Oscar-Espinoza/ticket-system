// Glue between a synced collaborative doc and the markdown snapshot stored on
// the row (issue.description / document.content). Line-by-line port of
// src/components/collab/use-collab-editor.ts:
// - empty key → seed the Y.Doc from the markdown (server accepts one seed);
// - diverged → issue descriptions: decided by who wrote the stored markdown
//   last (snapshot.projection, read at sync time — never the page's possibly
//   stale copy): 'collab' = our own projection, so the doc is at least as new
//   and wins (the snapshot is re-saved; this heals a save lost after its Yjs
//   update reached the server); anything else = an API / Slack / raw-mode edit
//   the doc never saw, so the markdown wins when nobody else is in the doc and
//   is then marked adopted (onAdopted). Documents: the collaborative state wins
//   and the snapshot is re-saved;
// - local typing (never remote steps) saves the snapshot `delay` ms after it
//   stops, flushed on unmount — so N collaborators don't all save each change.
//
// API (call during component init; the options are a GETTER so they stay live):
//   const collabEditor = useCollabEditor(() => ({ provider, snapshot, editor, markdown, truth,
//                                                 hasPeers, onSave, onAdopted, delay }));
//   collabEditor.state   'pending' | 'ready' | 'lossy' (reactive)
//   collabEditor.onChange  pass to MarkdownEditor's onChange
// `markdown`, `truth` (and the first `hasPeers`) are read once, when the hook
// starts, like React's initial ref; callbacks and `hasPeers` are read fresh.

import { untrack } from 'svelte';
import type { Editor, JSONContent } from '@tiptap/core';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';

import { keepsText, normalizeParsed, tidyMarkdown } from '@/lib/components/editor/markdown-io';
import { serializeMarkdown } from '@/lib/components/editor/rich-editor.svelte';
import type { CollabProvider, CollabSnapshot } from '@/lib/collab/provider';
import { reconcileTarget } from './reconcile';

export { reconcileTarget };

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

/**
 * Inside the Y.Doc: the ticket.description_rev it adopted. Written in the same
 * Yjs transaction as the adopted content, so it is persisted exactly when that
 * content is, and every later editor can tell "the doc already contains this
 * external edit (and maybe newer work)" from "the doc never saw it".
 */
const META = 'collab-meta';
const ADOPTED_REV = 'adoptedRev';

function seedUpdate(editor: Editor, doc: JSONContent, adopted: number | null): Uint8Array {
  const scratch = new Y.Doc();
  // 'default' is the Collaboration extension's fragment name.
  prosemirrorJSONToYXmlFragment(editor.schema, doc, scratch.getXmlFragment('default'));
  if (adopted !== null) scratch.getMap(META).set(ADOPTED_REV, adopted);
  const update = Y.encodeStateAsUpdate(scratch);
  scratch.destroy();
  return update;
}

export type CollabEditorState = 'pending' | 'ready' | 'lossy';

export interface UseCollabEditorOptions {
  provider: CollabProvider | null;
  snapshot: CollabSnapshot;
  editor: Editor | null;
  /** The stored snapshot when the editor opened. */
  markdown: string;
  /** Which side wins when they differ on open. */
  truth: 'markdown' | 'collab';
  hasPeers: boolean;
  onSave: (markdown: string) => void;
  /** The doc now holds the stored markdown (issue keys): record that it was adopted. */
  onAdopted?: (markdown: string) => void;
  delay?: number;
}

export function useCollabEditor(options: () => UseCollabEditorOptions): {
  readonly state: CollabEditorState;
  onChange: (markdown: string) => void;
} {
  let state = $state<CollabEditorState>('pending');
  // Latest serialization from MarkdownEditor's onChange (it runs before our
  // update listener), so saves and the unmount flush don't serialize again.
  let latest: string | null = null;
  // What the stored snapshot already says (as far as we know): opening a doc
  // or undoing back to it isn't a change worth saving. Remote steps reset it.
  let baseline: string | null = null;
  let initFor: Editor | null = null;
  // The latest options, untracked (React's refs, refreshed every render).
  const current = () => untrack(options);
  const initial = untrack(() => {
    const { markdown, truth } = options();
    return { markdown, truth };
  });

  // Only these are tracked by the effects below (React's dependency lists).
  const editor = $derived(options().editor);
  const provider = $derived(options().provider);
  const synced = $derived(options().snapshot.synced);
  const empty = $derived(options().snapshot.empty);
  const canWrite = $derived(options().snapshot.canWrite);
  const delay = $derived(options().delay ?? 1500);

  // Reconcile once per editor, after the first sync.
  $effect(() => {
    const ed = editor;
    const prov = provider;
    if (!ed || !prov || !synced || initFor === ed) return;
    // Read so a change re-runs this check, as in React's deps (the guard above
    // keeps it to once per editor).
    void empty;
    void canWrite;
    untrack(() => {
      initFor = ed;
      const snapshot = current().snapshot;
      const { projection } = snapshot;
      const meta = prov.doc.getMap(META);
      const docRev = meta.get(ADOPTED_REV);
      const docAdoptedRev = typeof docRev === 'number' ? docRev : null;
      const { stored, winner } = reconcileTarget(projection, initial.markdown, initial.truth, docAdoptedRev);
      const adoptedRev = projection ? projection.rev : null;
      // Mark the stored markdown adopted only once the doc's copy of it is
      // durable on the server: the next editor will trust the doc after this.
      const adopted = (value: string) => {
        if (!projection || projection.source === 'collab' || !snapshot.canWrite) return;
        void prov.whenPersisted().then((persisted) => {
          if (persisted) current().onAdopted?.(value);
        });
      };

      const run = async () => {
        const text = stored.trim();
        const parsed = text ? parseMarkdown(ed, text) : null;
        if (snapshot.empty) {
          if (text) {
            if (!parsed) return 'lossy' as const;
            // Lost the race to another seeder → we caught up with theirs instead.
            if (snapshot.canWrite && !(await prov.seed(seedUpdate(ed, parsed.doc, adoptedRev)))) {
              return 'ready' as const;
            }
          }
          // Nothing to seed (empty description): still record the adopted
          // revision, so a later joiner doesn't clear text typed after this.
          if (!text && adoptedRev !== null && snapshot.canWrite) meta.set(ADOPTED_REV, adoptedRev);
          baseline = parsed?.normalized ?? text;
          adopted(stored);
          return 'ready' as const;
        }
        const serialized = serializeMarkdown(ed);
        const expected = parsed?.normalized ?? text;
        baseline = expected;
        if (serialized === expected) {
          if (adoptedRev !== null && snapshot.canWrite && docAdoptedRev !== adoptedRev) meta.set(ADOPTED_REV, adoptedRev);
          adopted(stored);
          return 'ready' as const;
        }
        if (winner === 'collab') {
          if (snapshot.canWrite) {
            baseline = serialized;
            current().onSave(serialized);
          }
          return 'ready' as const;
        }
        if (text && !parsed) return 'lossy' as const;
        // An issue's external edit (API, Slack, raw mode) that the doc hasn't
        // adopted yet (reconcileTarget checked the doc's own marker) is newer
        // than every open copy, so it is applied even with peers present — they
        // receive it as a normal change; otherwise their next snapshot save
        // would overwrite it. Without a projection (no source info), only alone.
        if (snapshot.canWrite && (projection || !current().hasPeers)) {
          // One Yjs transaction: the content and the marker that it was adopted
          // are persisted together (y-prosemirror syncs inside it).
          prov.doc.transact(() => {
            if (parsed) ed.commands.setContent(parsed.doc);
            else ed.commands.clearContent(true);
            if (adoptedRev !== null) meta.set(ADOPTED_REV, adoptedRev);
          });
          adopted(stored);
        }
        return 'ready' as const;
      };

      // Not cancelled when deps change (seeding flips `empty`); only a new editor matters.
      void run()
        .catch(() => 'ready' as const)
        .then((result) => {
          if (initFor === ed && !ed.isDestroyed) state = result;
        });
    });
  });

  // Debounced snapshot saves from local changes only (typing during a seed
  // counts; the seed itself and remote steps don't).
  const lossy = $derived(state === 'lossy');
  $effect(() => {
    const ed = editor;
    const wait = delay;
    if (!ed || lossy || !canWrite) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      timer = null;
      const value = latest ?? (ed.isDestroyed ? null : serializeMarkdown(ed));
      if (value === null || value === baseline) return;
      baseline = value;
      current().onSave(value);
    };
    const flush = () => {
      if (timer === null) return;
      clearTimeout(timer);
      save();
    };
    const onUpdate = ({ transaction }: { transaction: Parameters<typeof isChangeOrigin>[0] }) => {
      if (isChangeOrigin(transaction)) {
        baseline = null;
        return;
      }
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(save, wait);
    };
    ed.on('update', onUpdate);
    window.addEventListener('pagehide', flush);
    return () => {
      ed.off('update', onUpdate);
      window.removeEventListener('pagehide', flush);
      untrack(flush);
    };
  });

  const onChange = (value: string) => {
    latest = value;
  };
  return {
    get state() {
      return state;
    },
    onChange,
  };
}
