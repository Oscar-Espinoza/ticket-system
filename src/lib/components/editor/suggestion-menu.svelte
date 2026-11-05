<!--
  Caret-anchored suggestion list shared by both editor modes: members (@),
  issues (# / KEY-) and slash commands. Rendered inline inside the editor
  root, positioned by the caller; options pick on mousedown so the editor
  never loses focus. Port of src/components/editor/suggestion-menu.tsx.

  `style` is a CSS declaration string (React took a CSSProperties object);
  the menu width is prepended as in React. The file's non-component exports
  (MENU_WIDTH, MENU_CLASS, SlashCommand, SuggestionEntry, entryKey) are in
  ./suggestion-entries.ts; MemberOption is ./member-option.svelte.
-->
<script lang="ts">
  import EntryOption from './entry-option.svelte';
  import { MENU_CLASS, MENU_WIDTH, entryKey, type SuggestionEntry } from './suggestion-entries';

  const LABELS = { member: 'Mention a teammate', issue: 'Reference an issue', command: 'Insert block' };

  let {
    id,
    entries,
    active,
    loading,
    style,
    onPick,
    onHover,
  }: {
    id: string;
    entries: readonly SuggestionEntry[];
    active: number;
    loading?: boolean;
    style: string;
    onPick: (entry: SuggestionEntry) => void;
    onHover: (index: number) => void;
  } = $props();

  const kind = $derived(entries[0]?.type ?? 'issue');

  $effect(() => {
    document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  });
</script>

<ul {id} role="listbox" aria-label={LABELS[kind]} style="width: {MENU_WIDTH}px; {style}" class={MENU_CLASS}>
  {#if entries.length === 0 && loading}
    <li role="presentation" class="px-2 py-1.5 text-muted-foreground">Searching…</li>
  {/if}
  {#each entries as entry, i (entryKey(entry))}
    <EntryOption
      id={`${id}-${i}`}
      {entry}
      active={i === active}
      onPick={() => onPick(entry)}
      onHover={() => onHover(i)}
    />
  {/each}
</ul>
