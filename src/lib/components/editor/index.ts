// Barrel for the editor.
// `<Markdown source={text} />`; MarkdownEditor `actions` is a snippet; its handle is
// bind:this + exported functions (MarkdownEditor: focus(), getEditor()).

export { default as MarkdownEditor } from './markdown-editor.svelte';
export type { MarkdownEditorHandle, MarkdownEditorProps } from './markdown-editor.svelte';
export { default as Markdown } from './markdown.svelte';
export type { MarkdownProps } from './markdown.svelte';
export { default as MentionChip } from './mention-chip.svelte';
export { formatEdit, toggleTaskAt, mentionQueryAt, type MarkdownFormat } from '@/lib/components/editor/text-edits';
export { default as RichEditorProvider } from './rich-editor-provider.svelte';
export {
  setRichEditorContext,
  useRichEditorContext,
  type EditorIssue,
  type RichEditorContextValue,
} from './context.svelte';
export { embedFor, type Embed, type EmbedProvider } from '@/lib/components/editor/embeds';
export { default as EmbedFrame } from './embed-frame.svelte';
