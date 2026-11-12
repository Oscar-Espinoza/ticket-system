// The real Markdown pipeline of the views (src/mcp-ui/Markdown.svelte:
// svelte-exmarkdown + our remark/rehype plugins), rendered to HTML on hostile
// input. The hand-built tree test in mcp-ui-model.test.ts covers rehypeSafe on
// its own; this one covers what actually reaches the page.
import { render } from 'svelte/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

type MarkdownComponent = typeof import('../mcp-ui/Markdown.svelte').default;
let Markdown: MarkdownComponent;

beforeAll(async () => {
  // Markdown.svelte reaches the host through app.svelte.ts, which talks to window.parent when imported.
  vi.stubGlobal('window', { parent: {}, addEventListener: () => undefined });
  Markdown = (await import('../mcp-ui/Markdown.svelte')).default;
});

// Without Svelte's hydration comments.
const html = (source: string) => (render(Markdown, { props: { source } }) as { body: string }).body.replace(/<!--[\s\S]*?-->/g, '').replace(/^<div class="prose-view">|<\/div>$/g, '');

describe('Markdown in the views', () => {
  it('shows raw HTML outside backticks as literal text, never as markup', () => {
    const out = html('use the <div> tag, or <script>alert(1)</script> and <img src=x onerror=alert(1)>');
    expect(out).toContain('&lt;div>');
    expect(out).toContain('&lt;script>alert(1)&lt;/script>');
    expect(out).not.toMatch(/<(?:div|script|img)\b/i); // the wrapper is stripped by html()
    expect(out).not.toMatch(/<[^>]*\bonerror=/i);
  });

  it('shows an HTML block as a code block of its source', () => {
    const out = html('<div onclick="x()">\nhello\n</div>\n\nafter');
    expect(out).toMatch(/<pre><code>&lt;div onclick="x\(\)">\nhello\n&lt;\/div>\n<\/code><\/pre>/);
    expect(out).not.toMatch(/<div\b/);
    expect(out).toContain('after');
  });

  it('turns no unsafe link target into something clickable, however it is written', () => {
    const hostile = [
      '[a](javascript:alert(1))',
      '[b](JaVaScRiPt:alert(1))',
      '[c](&#106;avascript:alert(1))', // entity-encoded "j"
      '[d](&#x6A;avascript:alert(1))',
      '[e](java&#9;script:alert(1))',
      '[f](data:text/html;base64,PHNjcmlwdD4=)',
      '[g](vbscript:msgbox(1))',
      '[h](file:///etc/passwd)',
      '[i](mailto:a@example.com)',
      '[j](//evil.example/x)',
      '[k]( javascript:alert(1))',
      '<javascript:alert(1)>',
      '[l][ref]\n\n[ref]: javascript:alert(1)',
    ].join('\n\n');
    const out = html(hostile);
    // Nothing to click: no link element at all, and no URL attribute (a bare `<javascript:…>` stays visible text).
    expect(out).not.toMatch(/<(?:a|button)\b/i);
    expect(out).not.toMatch(/\b(?:href|src|title|on\w+)=/i);
    // The link text stays readable.
    for (const label of 'abcdefghijkl') expect(out).toContain(`>${label}<`);
  });

  it('renders a safe link as a button that goes through the host, not as an anchor', () => {
    const out = html('see [the docs](https://example.com/docs?a=1&b=2) now');
    expect(out).toMatch(/<button[^>]*class="link-text"[^>]*title="https:\/\/example\.com\/docs\?a=1&amp;b=2"[^>]*>the docs<\/button>/);
    expect(out).not.toMatch(/<a\b/);
  });

  it('does not load images and keeps the alt text', () => {
    const out = html('![diagram](https://tracker.example/p.png) ![](data:image/svg+xml;base64,AAAA)');
    expect(out).not.toMatch(/<img\b|src=/i);
    expect(out).toContain('[image: diagram]');
    expect(out).toContain('[image]');
  });

  it('still renders the Markdown people write', () => {
    const out = html('# Title\n\n- [x] done\n- [ ] todo\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~ `code` **bold**');
    expect(out).toMatch(/<h1>Title<\/h1>/);
    expect(out).toMatch(/<table>/);
    expect(out).toMatch(/<del>gone<\/del>/);
    expect(out).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
  });
});
