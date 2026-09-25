// Pure markdown formatting edits on a textarea selection. Each returns the
// range to replace, its replacement and the selection afterwards, so the editor
// can apply it with execCommand (keeping native undo).

export type MarkdownFormat =
  | 'bold'
  | 'italic'
  | 'code'
  | 'link'
  | 'bullet'
  | 'numbered'
  | 'task'
  | 'quote'
  | 'codeblock';

export interface TextEdit {
  start: number;
  end: number;
  text: string;
  selectStart: number;
  selectEnd: number;
}

const WRAP: Partial<Record<MarkdownFormat, string>> = { bold: '**', italic: '_', code: '`' };

const LINE_PREFIX: Partial<Record<MarkdownFormat, { match: RegExp; prefix: (i: number) => string }>> = {
  bullet: { match: /^[-*+] (?!\[[ xX]\] )/, prefix: () => '- ' },
  numbered: { match: /^\d+[.)] /, prefix: (i) => `${i + 1}. ` },
  task: { match: /^[-*+] \[[ xX]\] /, prefix: () => '- [ ] ' },
  quote: { match: /^> ?/, prefix: () => '> ' },
};

const ANY_LIST_MARKER = /^(?:[-*+] (?:\[[ xX]\] )?|\d+[.)] )/;

function wrap(value: string, start: number, end: number, marker: string): TextEdit {
  const m = marker.length;
  const selected = value.slice(start, end);
  // Toggle off when the selection is already wrapped.
  if (value.slice(start - m, start) === marker && value.slice(end, end + m) === marker) {
    return { start: start - m, end: end + m, text: selected, selectStart: start - m, selectEnd: end - m };
  }
  return {
    start,
    end,
    text: `${marker}${selected}${marker}`,
    selectStart: start + m,
    selectEnd: end + m,
  };
}

function link(value: string, start: number, end: number): TextEdit {
  const selected = value.slice(start, end);
  if (/^https?:\/\/\S+$/.test(selected)) {
    // Selected a URL: caret goes into the (empty) link text.
    return { start, end, text: `[](${selected})`, selectStart: start + 1, selectEnd: start + 1 };
  }
  const label = selected || 'text';
  const urlStart = start + label.length + 3;
  return {
    start,
    end,
    text: `[${label}](url)`,
    // No selection: select the label to type over; otherwise select "url".
    selectStart: selected ? urlStart : start + 1,
    selectEnd: selected ? urlStart + 3 : start + 1 + label.length,
  };
}

function prefixLines(value: string, start: number, end: number, format: MarkdownFormat): TextEdit {
  const rule = LINE_PREFIX[format]!;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const newline = value.indexOf('\n', end);
  const lineEnd = newline === -1 ? value.length : newline;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const filled = lines.filter((line) => line.trim());
  const remove = filled.length > 0 && filled.every((line) => rule.match.test(line));
  // Blank lines inside a multi-line selection stay blank; switching list kinds
  // replaces the old marker instead of stacking a second one.
  let n = 0;
  const text = lines
    .map((line) => {
      if (remove) return line.replace(rule.match, '');
      if (!line.trim() && lines.length > 1) return line;
      const body = format === 'quote' ? line : line.replace(ANY_LIST_MARKER, '');
      return `${rule.prefix(n++)}${body}`;
    })
    .join('\n');
  const caret = lineStart + text.length;
  return { start: lineStart, end: lineEnd, text, selectStart: caret, selectEnd: caret };
}

function codeBlock(value: string, start: number, end: number): TextEdit {
  const selected = value.slice(start, end);
  const before = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
  const open = `${before}\`\`\`\n`;
  const text = `${open}${selected}\n\`\`\``;
  return {
    start,
    end,
    text,
    selectStart: start + open.length,
    selectEnd: start + open.length + selected.length,
  };
}

export function formatEdit(value: string, start: number, end: number, format: MarkdownFormat): TextEdit {
  const marker = WRAP[format];
  if (marker) return wrap(value, start, end, marker);
  if (format === 'link') return link(value, start, end);
  if (format === 'codeblock') return codeBlock(value, start, end);
  return prefixLines(value, start, end, format);
}

/** Flip the task checkbox of the list item starting at `offset`; null if none is there. */
export function toggleTaskAt(source: string, offset: number, checked: boolean): string | null {
  const rest = source.slice(offset);
  const match = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[[ xX]\]/.exec(rest);
  if (!match) return null;
  return `${source.slice(0, offset)}${match[1]}${checked ? '[x]' : '[ ]'}${rest.slice(match[0].length)}`;
}

/** The `@query` being typed right before the caret, if any. */
export function mentionQueryAt(value: string, caret: number): { start: number; query: string } | null {
  const match = /(?:^|[\s(])@([^\s@[\]()]{0,40})$/.exec(value.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[1].length - 1, query: match[1] };
}
