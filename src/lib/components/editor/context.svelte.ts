// Where the editor is being used, for image uploads and `#` issue suggestions.
// Hosts that know more than the project route (an issue, a doc) wrap their
// subtree; explicit MarkdownEditor props win over this, and this wins over the
// current project route. D2 (docs + collaboration) extends editors through
// `extensions` / `history` here or on the props.
//
// API (port of src/components/editor/context.tsx):
//   setRichEditorContext(() => value)       provider; call during component init, GETTER arg
//   <RichEditorProvider value={{ … }}>      same, as a component (rich-editor-provider.svelte)
//   useRichEditorContext(): RichEditorContextValue | null
// The returned object is a live view (fields forward to the latest value); read
// fields off it rather than destructuring.

import { createContext } from 'svelte';
import type { AnyExtension } from '@tiptap/core';

import type { WorkflowState } from '@/lib/issue-model';

import type { EditorIssue } from '@/lib/editor-issue';
export type { EditorIssue };

export interface RichEditorContextValue {
  /** Project that owns pasted images (→ /api/uploads) and scopes `#` suggestions. */
  projectId?: string;
  /** Issue context: pasted images become issue attachments (→ /api/attachments). */
  ticketId?: string;
  /** `#` candidates; without it suggestions are fetched from the server. */
  issues?: readonly EditorIssue[];
  /** Extra Tiptap extensions, appended after the built-in ones. */
  extensions?: AnyExtension[];
  /** Built-in undo history (default true). Collaboration brings its own — pass false. */
  history?: boolean;
}

class RichEditorContextView implements RichEditorContextValue {
  #get: () => RichEditorContextValue;
  constructor(get: () => RichEditorContextValue) {
    this.#get = get;
  }
  get projectId() {
    return this.#get().projectId;
  }
  get ticketId() {
    return this.#get().ticketId;
  }
  get issues() {
    return this.#get().issues;
  }
  get extensions() {
    return this.#get().extensions;
  }
  get history() {
    return this.#get().history;
  }
}

const [getContext, setContext, hasContext] = createContext<RichEditorContextView>();

export function setRichEditorContext(value: () => RichEditorContextValue): RichEditorContextValue {
  return setContext(new RichEditorContextView(value));
}

export function useRichEditorContext(): RichEditorContextValue | null {
  return hasContext() ? getContext() : null;
}
