// Reproduces a review finding on PR #15: a project description of `===`
// placed on its own line turned the project row above it into a heading in
// the text Claude Code reads. Text that can start a Markdown block must stay
// inert wherever it lands.
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from 'mdast-util-from-markdown';

import { userContentInline } from '@/lib/server/mcp/format';

const blockTypes = (md: string) => fromMarkdown(md).children.map((n) => n.type);

describe('userContentInline at the start of a line', () => {
  it.each(['===', '---', '- item', '+ item', '1. item', '2) item'])('keeps %j from starting a block', (value) => {
    const types = blockTypes(`- **WEB** Website\n  ${userContentInline(value)}`);
    expect(types).toEqual(['list']);
    expect(blockTypes(`Row above\n${userContentInline(value)}`)).toEqual(['paragraph']);
  });

  it('leaves plain text as it is', () => {
    expect(userContentInline('Fix login')).toBe('Fix login');
  });
});
