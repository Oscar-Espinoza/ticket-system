// Renders text containing search highlight sentinels as text + <mark> nodes.
// React escapes every segment, so issue content can never inject markup.

import { Fragment } from 'react';

// Duplicated from lib/search.ts (server-only) — keep in sync.
const MARK_START = '';
const MARK_END = '';

export function Highlight({ text }: { text: string }) {
  // "abc" → ["a", "bc"]: each part after the first starts marked.
  const parts = text.split(MARK_START);
  return (
    <>
      {parts.map((part, index) => {
        if (index === 0) return <Fragment key={index}>{part.replaceAll(MARK_END, '')}</Fragment>;
        const end = part.indexOf(MARK_END);
        const marked = end === -1 ? part : part.slice(0, end);
        const rest = end === -1 ? '' : part.slice(end + 1).replaceAll(MARK_END, '');
        return (
          <Fragment key={index}>
            <mark className="rounded-sm bg-yellow-200/70 px-px text-inherit dark:bg-yellow-500/30">
              {marked}
            </mark>
            {rest}
          </Fragment>
        );
      })}
    </>
  );
}
