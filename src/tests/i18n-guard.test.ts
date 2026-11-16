// Guard: no hardcoded English interface text in .svelte files. Interface text
// comes from messages/{locale}.json through `m.*()` (src/lib/i18n.ts).
//
// What counts as hardcoded: a text node in the markup with a word in it, a
// literal `placeholder` / `aria-label` / `title` / `alt` / `label` attribute,
// or a literal string passed to `toast(...)`. Expressions (`{...}`), <script>,
// <style> and comments are ignored.
//
// Exceptions: a whole file in src/tests/i18n-allowlist/*.json (with a reason),
// or a line with an `i18n-ignore` comment (brand names, code samples, keyboard
// keys).
//
// Also checks that every message file (messages/{locale}.json and
// messages/<area>/{locale}.json, all listed in project.inlang) has the same keys
// in every locale, that no key is defined twice, and that project.inlang lists
// exactly the app's locales.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '@/lib/i18n-locales';

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');
const SKIP_DIRS = ['src/lib/paraglide', 'node_modules'];

const ALLOWLIST_DIR = join(__dirname, 'i18n-allowlist');
const allowlist: Record<string, string> = Object.assign(
  {},
  ...readdirSync(ALLOWLIST_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(ALLOWLIST_DIR, f), 'utf8')).files as Record<string, string>),
);

const settings = JSON.parse(readFileSync(join(ROOT, 'project.inlang', 'settings.json'), 'utf8'));
const pathPatterns: string[] = [settings['plugin.inlang.messageFormat'].pathPattern].flat();
const messageKeys = (pattern: string, locale: string) =>
  Object.keys(JSON.parse(readFileSync(join(ROOT, pattern.replace('{locale}', locale)), 'utf8')))
    .filter((k) => k !== '$schema')
    .sort();

function svelteFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(ROOT, path);
    if (SKIP_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) continue;
    if (statSync(path).isDirectory()) svelteFiles(path, out);
    else if (name.endsWith('.svelte')) out.push(rel);
  }
  return out;
}

const blank = (s: string) => s.replace(/[^\n]/g, ' ');

/**
 * Replaces `{ ... }` expressions (nested braces, strings) with spaces, keeping
 * line breaks. Reports each string literal found inside an expression to
 * `onLiteral` (its text and the index of its opening quote).
 */
function blankExpressions(source: string, onLiteral?: (text: string, index: number) => void): string {
  let out = '';
  let depth = 0;
  let quote: string | null = null;
  let literalStart = -1;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (depth === 0) {
      if (c === '{') {
        depth = 1;
        out += ' ';
      } else out += c;
      continue;
    }
    if (quote) {
      if (c === '\\') {
        out += source[i + 1] === '\n' ? ' \n' : '  ';
        i++;
        continue;
      }
      if (c === quote) {
        quote = null;
        onLiteral?.(source.slice(literalStart + 1, i), literalStart);
      }
    } else if (c === '/' && source[i + 1] === '/') {
      // A line comment inside an expression: its apostrophes aren't quotes.
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += ' '.repeat(stop - i);
      i = stop - 1;
      continue;
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop - 1;
      continue;
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c;
      literalStart = i;
    }
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    out += c === '\n' ? '\n' : ' ';
  }
  return out;
}


const WORD = /[A-Za-z]{2,}/;
/**
 * A string literal inside a markup expression that reads as interface text:
 * capitalised words with a space (`'Select all issues'`, `` `Assigned to ${x}` ``),
 * or a lowercase phrase glued to a value (`` ` points` ``). Class lists, ids
 * and single words (enum values, keys) don't match.
 */
const SENTENCE = /(^|[^A-Za-z-])[A-Z][a-z’']+(?: [A-Za-z’']+)+|^ ?[a-z]{3,}(?: [a-z]{2,})* ?$/;
const isUiLiteral = (text: string) => {
  const plain = text.replace(/\$\{[^}]*\}/g, ' ').trim();
  return plain.includes(' ') || /^ /.test(text) ? SENTENCE.test(text.replace(/\$\{[^}]*\}/g, '')) && !/[:=;]|\b(?:px|rem|var|calc)\b|\/\//.test(plain) : false;
};
const TEXT_ATTRS = /\s(?:placeholder|aria-label|aria-description|title|alt|label)=(?:"([^"]*)"|'([^']*)')/g;
const TOAST = /\btoast(?:\.\w+)?\(\s*(['"`])((?:(?!\1).)*[A-Za-z]{2,}(?:(?!\1).)*)\1/g;

export type Finding = { line: number; text: string };

/** Hardcoded interface strings in one .svelte source. Exported for the allow-list tooling. */
export function findHardcoded(source: string): Finding[] {
  const lines = source.split('\n');
  const ignored = new Set(lines.flatMap((l, i) => (/i18n-ignore/.test(l) ? [i + 1] : [])));
  const findings: Finding[] = [];
  const add = (index: number, text: string, within: string) => {
    const line = within.slice(0, index).split('\n').length;
    if (!ignored.has(line)) findings.push({ line, text: text.replace(/\s+/g, ' ').trim().slice(0, 80) });
  };

  // toast('...') in scripts.
  for (const script of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const offset = script.index! + script[0].indexOf('>') + 1;
    for (const t of script[1].matchAll(TOAST)) add(offset + t.index!, t[2], source);
  }

  // Markup: drop scripts, styles and comments (keeping line numbers), then expressions.
  let markup = source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, blank)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
  const literals: { text: string; index: number }[] = [];
  markup = blankExpressions(markup, (text, index) => literals.push({ text, index }));
  // Literals inside expressions: `label={x ? 'Assign' : `Assigned to ${n}`}`.
  // Search keywords (`keywords={[…]}`) are matched against English input on
  // purpose and are skipped.
  for (const l of literals) {
    const lineStart = markup.lastIndexOf('\n', l.index) + 1;
    if (/\bkeywords=\{/.test(source.slice(lineStart, l.index))) continue;
    if (isUiLiteral(l.text)) add(l.index, l.text, markup);
  }

  for (const a of markup.matchAll(TEXT_ATTRS)) {
    const value = a[1] ?? a[2];
    if (WORD.test(value)) add(a.index!, value, markup);
  }
  // Text between tags (tags themselves, with their attributes, are skipped).
  const textOnly = markup.replace(/<[^>]*>/g, (tag) => blank(tag));
  // One finding per line, so an `i18n-ignore` covers only its own line.
  for (const t of textOnly.matchAll(/[^\s<>][^<>\n]*/g)) {
    const text = t[0];
    if (WORD.test(text) && !/^&[a-z]+;$/.test(text.trim())) add(t.index!, text, textOnly);
  }
  return findings;
}

describe('i18n guard', () => {
  const files = svelteFiles(SRC);

  it('finds .svelte files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('has no hardcoded English interface text in .svelte files', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (allowlist[file]) continue;
      for (const f of findHardcoded(readFileSync(join(ROOT, file), 'utf8'))) {
        offenders.push(`${file}:${f.line}  ${JSON.stringify(f.text)}`);
      }
    }
    expect(
      offenders,
      'Move these strings to messages/*.json and use m.*() (messages/GLOSSARY.md), or mark a line `i18n-ignore`.',
    ).toEqual([]);
  });

  it('allow-list entries exist and give a reason', () => {
    for (const [file, reason] of Object.entries(allowlist)) {
      expect(files, `allow-listed file ${file} no longer exists`).toContain(file);
      expect(reason.trim().length, `allow-list entry ${file} needs a reason`).toBeGreaterThan(0);
    }
  });

  it('every message file has the same keys in every locale, and no key twice', () => {
    const seen = new Map<string, string>();
    for (const pattern of pathPatterns) {
      const base = messageKeys(pattern, 'en');
      for (const locale of LOCALES) expect(messageKeys(pattern, locale), pattern.replace('{locale}', locale)).toEqual(base);
      for (const key of base) {
        expect(seen.get(key), `message ${key} is defined in ${seen.get(key)} and ${pattern}`).toBeUndefined();
        seen.set(key, pattern);
      }
    }
  });

  it('project.inlang lists exactly the app locales', () => {
    expect([...settings.locales].sort()).toEqual([...LOCALES].sort());
    expect(settings.baseLocale).toBe('en');
  });
});
