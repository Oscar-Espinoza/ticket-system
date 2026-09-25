// Post-auth destination from `?redirect=` (invite pages send people here with
// `/login?redirect=/invite/<token>`). Only same-origin app paths under
// /dashboard or /invite/ are honoured — anything else (//host, schemes,
// backslashes, `..` escapes) falls back to /dashboard, so the param can't be
// used as an open redirect. Client-safe.

export const DEFAULT_AUTH_REDIRECT = '/dashboard';

export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_AUTH_REDIRECT;
  // Browsers treat "\" like "/" and strip tabs/newlines, so `/\evil.com` or
  // `/\t/evil.com` would become protocol-relative.
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s]/.test(value) ||
    [...value].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)
  ) {
    return DEFAULT_AUTH_REDIRECT;
  }
  const base = 'http://app.invalid';
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
  if (url.origin !== base) return DEFAULT_AUTH_REDIRECT;
  // Checked after URL normalisation, so `/invite/../api` can't slip through.
  const { pathname } = url;
  const allowed =
    pathname === '/dashboard' || pathname.startsWith('/dashboard/') || pathname.startsWith('/invite/');
  return allowed ? `${pathname}${url.search}${url.hash}` : DEFAULT_AUTH_REDIRECT;
}

/** `/login` or `/signup` carrying the destination along (omitted when it's the default). */
export function authHref(page: '/login' | '/signup', redirectTo: string): string {
  return redirectTo === DEFAULT_AUTH_REDIRECT
    ? page
    : `${page}?redirect=${encodeURIComponent(redirectTo)}`;
}
