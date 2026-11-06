import { VIEW_COOKIE } from '@/lib/issue-model';

/** The issues layout remembered in the session cookie, for a load's `defaultView`. */
export function readDefaultView(cookies: { get(name: string): string | undefined }) {
  return cookies.get(VIEW_COOKIE);
}
