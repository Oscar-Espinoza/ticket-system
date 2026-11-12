// The pure parts of the MCP Apps views (src/mcp-ui): grouping, dates, colours,
// burndown geometry and the Markdown link rules, plus a scan that keeps the
// view's sources free of network and HTML-injection APIs (docs/mcp/PLAN.md
// security checklist, "Views and XSS").
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { CycleView, IssueSummary } from '@/lib/server/mcp/contracts';
import { rehypeSafe, safeHref } from '../mcp-ui/lib/markdown';
import { burndownGeometry, dueTone, groupIssues, initials, plainText, relativeTime, safeColor, typeSegments } from '../mcp-ui/lib/model';

const issue = (key: string, state: [string, string], priority = 'none'): IssueSummary => ({
  id: key,
  key,
  title: key,
  project: { id: 'p', key: 'WEB', name: 'Web' },
  state: { id: state[0], name: state[0], type: state[1], color: '#888888' },
  priority,
  assignee: null,
  waitingOn: null,
  labels: [],
  estimate: null,
  dueDate: null,
  followUp: null,
  updatedAt: '2026-11-01T00:00:00.000Z',
  url: 'http://localhost/x',
  excerpt: null,
});

describe('groupIssues', () => {
  const rows = [
    issue('A-1', ['Done', 'completed'], 'low'),
    issue('A-2', ['In Review', 'started'], 'urgent'),
    issue('A-3', ['Todo', 'unstarted'], 'urgent'),
    issue('A-4', ['In Progress', 'started'], 'none'),
    issue('A-5', ['Todo', 'unstarted'], 'high'),
  ];

  it('orders state groups by workflow type, then name, keeping row order inside', () => {
    const groups = groupIssues(rows, 'state');
    expect(groups.map((g) => g.label)).toEqual(['Todo', 'In Progress', 'In Review', 'Done']);
    expect(groups[0]!.issues.map((i) => i.key)).toEqual(['A-3', 'A-5']);
  });

  it('orders priority groups urgent first and labels them', () => {
    const groups = groupIssues(rows, 'priority');
    expect(groups.map((g) => g.label)).toEqual(['Urgent', 'High', 'Low', 'No priority']);
  });

  it('returns one unlabelled group without groupBy', () => {
    expect(groupIssues(rows, null)).toEqual([{ key: 'all', label: '', color: null, issues: rows }]);
  });
});

describe('text and colour helpers', () => {
  it('builds initials from the first and last word, never from markup-only words', () => {
    expect(initials('Ana María López')).toBe('AL');
    expect(initials('grace')).toBe('G');
    expect(initials('  ')).toBe('?');
    expect(initials('<<>> 山田 太郎')).toBe('山太');
  });

  it('flattens Markdown in a search snippet to plain text', () => {
    expect(plainText('Users on **slow networks** see [the write-up](https://x.example/a) ... ```ts\nconst a_b = 1;\n``` ~~old~~')).toBe(
      'Users on slow networks see the write-up ... const a_b = 1; old',
    );
  });

  it('lets only hex colours reach a style attribute', () => {
    expect(safeColor('#E5A100')).toBe('#E5A100');
    expect(safeColor('red; background:url(//evil)')).toBe('#8b8f97');
    expect(safeColor('var(--x)')).toBe('#8b8f97');
    expect(safeColor(null)).toBe('#8b8f97');
  });

  it('classifies due dates against today', () => {
    expect(dueTone('2026-11-11', '2026-11-12')).toBe('overdue');
    expect(dueTone('2026-11-12', '2026-11-12')).toBe('soon');
    expect(dueTone('2026-11-15', '2026-11-12')).toBe('soon');
    expect(dueTone('2026-11-16', '2026-11-12')).toBe('later');
  });

  it('words a relative time', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    expect(relativeTime('2026-11-09T12:00:00Z', now, 'en')).toBe('3 days ago');
    expect(relativeTime('not a date', now)).toBe('');
  });
});

describe('typeSegments', () => {
  it('orders by workflow type, drops zeros and sums to 100%', () => {
    const { total, segments } = typeSegments({ completed: 6, started: 2, backlog: 2, canceled: 0 });
    expect(total).toBe(10);
    expect(segments.map((s) => s.type)).toEqual(['backlog', 'started', 'completed']);
    expect(segments.reduce((sum, s) => sum + s.percent, 0)).toBeCloseTo(100);
  });
});

describe('burndownGeometry', () => {
  const totals = (scope: number, completed: number) => ({ scope, started: 0, completed, scopePoints: 0, startedPoints: 0, completedPoints: 0 });
  const cycle = {
    startsAt: '2026-11-01T00:00:00.000Z',
    endsAt: '2026-11-11T00:00:00.000Z',
    totals: totals(10, 6),
    burndown: [
      { at: '2026-11-01T00:00:00.000Z', totals: totals(10, 0) },
      { at: '2026-11-04T00:00:00.000Z', totals: totals(10, 3) },
      { at: '2026-11-07T00:00:00.000Z', totals: totals(10, 6) },
    ],
  } as Pick<CycleView, 'startsAt' | 'endsAt' | 'burndown' | 'totals'>;

  it('draws remaining issues as a step line to now and the ideal line to zero', () => {
    const geo = burndownGeometry(cycle, 106, 56, new Date('2026-11-09T00:00:00Z'), 3)!;
    // Box 100 × 50 inside a 3px pad; 10 issues at the top (y=3), zero at y=53.
    expect(geo.ideal).toBe('M3,3L103,53');
    expect(geo.actual).toBe('M3,3H33V18H63V33H83');
    expect(geo.todayX).toBe(83);
    expect(geo.baseline).toBe(53);
  });

  it('has no today marker outside the cycle and nothing to draw without scope', () => {
    expect(burndownGeometry(cycle, 106, 56, new Date('2026-12-01T00:00:00Z'), 3)!.todayX).toBeNull();
    expect(burndownGeometry({ ...cycle, totals: totals(0, 0), burndown: [] }, 100, 50)).toBeNull();
    expect(burndownGeometry({ ...cycle, endsAt: cycle.startsAt }, 100, 50)).toBeNull();
  });
});

describe('Markdown link rules', () => {
  it('keeps http, https and mailto and nothing else', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:a@example.com')).toBe('mailto:a@example.com');
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '  javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      '​javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '/relative/path',
      '//evil.example/x',
      '#frag',
      '',
    ]) {
      expect(safeHref(bad), bad).toBeNull();
    }
    expect(safeHref(undefined)).toBeNull();
  });

  it('drops raw HTML nodes, unsafe URLs, handlers and styles from the tree', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'raw', value: '<script>alert(1)</script>' },
        {
          type: 'element',
          tagName: 'p',
          properties: { onclick: 'x()', style: 'x:y' },
          children: [
            { type: 'element', tagName: 'a', properties: { href: 'javascript:alert(1)' }, children: [] },
            { type: 'element', tagName: 'a', properties: { href: 'https://ok.example' }, children: [] },
            { type: 'element', tagName: 'img', properties: { src: 'data:image/svg+xml,x' }, children: [] },
          ],
        },
      ],
    };
    rehypeSafe()(tree);
    const p = tree.children[0] as unknown as { properties: Record<string, unknown>; children: { properties: Record<string, unknown> }[] };
    expect(tree.children).toHaveLength(1);
    expect(p.properties).toEqual({});
    expect(p.children[0]!.properties).toEqual({});
    expect(p.children[1]!.properties).toEqual({ href: 'https://ok.example' });
    expect(p.children[2]!.properties).toEqual({});
  });
});

describe('view sources and bundle', () => {
  const root = join(__dirname, '..', 'mcp-ui');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const sources = walk(root).filter((f) => /\.(ts|svelte)$/.test(f));

  // The view talks to the host with postMessage only; user text is never HTML.
  const forbidden = /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource|sendBeacon|\{@html|\.innerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function|localStorage|sessionStorage|document\.cookie/;

  it('uses no network, storage or HTML-injection API', () => {
    for (const file of sources) {
      const code = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
      expect(code, file).not.toMatch(forbidden);
    }
  });

  it('builds a bundle with no fetch, XHR or WebSocket in it', () => {
    const bundle = join(__dirname, '..', 'lib', 'server', 'mcp', 'ui', 'app.html');
    // Built by `npm run build:mcp-ui` (prebuild, so always present in CI); a fresh checkout without it has nothing to scan.
    if (!existsSync(bundle)) return;
    const html = readFileSync(bundle, 'utf8');
    expect(html).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|new Function|\beval\s*\(/);
    // One file: no external script, stylesheet or image.
    expect(html).not.toMatch(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']?(?:https?:)?\/\//i);
  });
});
