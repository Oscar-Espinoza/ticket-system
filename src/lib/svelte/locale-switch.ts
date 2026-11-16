// Switching the interface language in place, without loading the document
// again. The root layout (src/routes/+layout.svelte) calls switchLocale when the
// server's locale for the page (its `data.locale`) no longer matches what is on
// screen: after Settings › Profile › Language saved a new one and refreshed the
// page data, or after signing in to (or out of) an account with another
// language.
//
// The browser's current language is <html lang> (src/hooks.client.ts), so
// setting it and re-rendering the keyed app subtree makes every m.*() call and
// locale-aware formatter produce the new language. The swap runs inside a short
// cross-fade (View Transitions, where supported and motion is allowed), and the
// scroll positions and focused element are put back afterwards, since the
// subtree is mounted again.

import { tick } from 'svelte';
import { cookieMaxAge, cookieName } from '@/lib/paraglide/runtime';
import type { AppLocale } from '@/lib/i18n-locales';

type Path = number[];

/** Child-index path from <body> to `el`, to find "the same" element after a re-render. */
function pathOf(el: Element): Path | null {
  const path: Path = [];
  let node: Element | null = el;
  while (node && node !== document.body) {
    const parent: Element | null = node.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return node === document.body ? path : null;
}

function elementAt(path: Path): Element | null {
  let node: Element | null = document.body;
  for (const index of path) {
    node = node?.children[index] ?? null;
    if (!node) return null;
  }
  return node;
}

interface ViewState {
  windowY: number;
  scrolled: { id: string | null; path: Path | null; top: number; left: number }[];
  focus: { id: string | null; path: Path | null } | null;
}

function captureView(): ViewState {
  const scrolled: ViewState['scrolled'] = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.scrollTop > 0 || el.scrollLeft > 0) {
      scrolled.push({ id: el.id || null, path: pathOf(el), top: el.scrollTop, left: el.scrollLeft });
    }
  }
  const active = document.activeElement;
  const focus =
    active && active !== document.body ? { id: active.id || null, path: pathOf(active) } : null;
  return { windowY: window.scrollY, scrolled, focus };
}

function find(target: { id: string | null; path: Path | null }): Element | null {
  return (target.id && document.getElementById(target.id)) || (target.path && elementAt(target.path)) || null;
}

function restoreView(state: ViewState) {
  for (const s of state.scrolled) {
    const el = find(s);
    if (el) {
      el.scrollTop = s.top;
      el.scrollLeft = s.left;
    }
  }
  if (window.scrollY !== state.windowY) window.scrollTo({ top: state.windowY, behavior: 'instant' });
  if (state.focus) (find(state.focus) as HTMLElement | null)?.focus?.({ preventScroll: true });
}

/** This browser's remembered choice (what a signed-out page uses); null clears it. */
export function writeLocaleCookie(locale: AppLocale | null) {
  document.cookie = locale
    ? `${cookieName}=${locale}; path=/; max-age=${cookieMaxAge}; samesite=lax`
    : `${cookieName}=; path=/; max-age=0`;
}

/**
 * Shows the app in `next`: sets <html lang>, then `render(next)` (which
 * re-keys the app subtree), with a short cross-fade when supported and motion
 * is allowed; scroll and focus are restored after the new DOM is in place.
 */
export async function switchLocale(next: AppLocale, render: (locale: AppLocale) => void): Promise<void> {
  const view = captureView();
  const swap = async () => {
    document.documentElement.lang = next;
    render(next);
    await tick();
    restoreView(view);
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || typeof document.startViewTransition !== 'function') {
    await swap();
    return;
  }
  // The cross-fade's timing lives in src/app.css under html[data-locale-switch].
  const root = document.documentElement;
  root.dataset.localeSwitch = '';
  try {
    await document.startViewTransition(swap).finished;
  } finally {
    delete root.dataset.localeSwitch;
  }
}
