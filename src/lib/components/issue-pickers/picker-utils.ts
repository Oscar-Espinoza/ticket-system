// Plain helpers shared by the property pickers (port of the non-component
// exports of src/components/issue-pickers/picker-popover.tsx and label-picker.tsx).
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

// New labels get a random swatch from Linear-ish defaults; B9's settings edit it.
export const LABEL_COLORS = [
  '#5e6ad2',
  '#26b5ce',
  '#4cb782',
  '#f2c94c',
  '#f2994a',
  '#eb5757',
  '#bb87fc',
  '#95a2b3',
];
