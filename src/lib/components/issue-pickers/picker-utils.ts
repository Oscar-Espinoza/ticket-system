// Plain helpers shared by the property pickers (the non-component
// exports of picker-popover and label-picker).
// Also re-exported from picker-popover.svelte's module script and from index.ts.

/** cmdk filter over `keywords` only — item values are ids and must not match. */
export function keywordFilter(_value: string, search: string, keywords?: string[]): number {
  const query = search.trim().toLowerCase();
  if (!query) return 1;
  return keywords?.some((k) => k.toLowerCase().includes(query)) ? 1 : 0;
}

/** Digit shortcut handler: `pick(n)` for 0–9 while the search box is empty. */
export function digitShortcut(search: string, pick: (digit: number) => boolean) {
  return (event: KeyboardEvent) => {
    if (search || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!/^[0-9]$/.test(event.key)) return;
    if (pick(Number(event.key))) event.preventDefault();
  };
}

export { LABEL_COLORS } from '@/lib/label-model';
