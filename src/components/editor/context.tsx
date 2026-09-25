'use client';

// Where the editor is being used, for image uploads and `#` issue suggestions.
// Hosts that know more than the project route (an issue, a doc) wrap their
// subtree; explicit MarkdownEditor props win over this, and this wins over the
// current project route. D2 (docs + collaboration) extends editors through
// `extensions` / `history` here or on the props.

import { createContext, use, type ReactNode } from 'react';
import type { AnyExtension } from '@tiptap/react';

import type { WorkflowState } from '@/lib/issue-model';

export interface EditorIssue {
  id: string;
  /** "APP-12" */
  key: string;
  title: string;
  state?: Pick<WorkflowState, 'name' | 'type' | 'color'>;
}

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

const RichEditorContext = createContext<RichEditorContextValue | null>(null);

export function RichEditorProvider({
  value,
  children,
}: {
  value: RichEditorContextValue;
  children: ReactNode;
}) {
  return <RichEditorContext value={value}>{children}</RichEditorContext>;
}

export function useRichEditorContext(): RichEditorContextValue | null {
  return use(RichEditorContext);
}
