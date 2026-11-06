// The result contract every server action shares with the forms that call it:
// `{ ok: true, …value }` or `{ ok: false, error, field? }`, where `error` is
// user-facing text except the two auth sentinels below (the UI maps
// 'Forbidden' with actionErrorText). Plus the input checks most actions need.

import { HEX_COLOR_RE } from '@/lib/colors';

export type Fail<Field extends string = string> = { ok: false; error: string; field?: Field };

export type ActionResult<T = object, Field extends string = string> = ({ ok: true } & T) | Fail<Field>;

export const NOT_AUTHENTICATED = { ok: false, error: 'Not authenticated' } as const;
export const FORBIDDEN = { ok: false, error: 'Forbidden' } as const;

/** What an authorization gate hands back when it refuses. */
export type AuthFail = typeof NOT_AUTHENTICATED | typeof FORBIDDEN;

export function fail<Field extends string = never>(error: string, field?: Field): Fail<Field> {
  return field === undefined ? { ok: false, error } : { ok: false, error, field };
}

export const isFail = (value: unknown): value is Fail =>
  typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false;

/**
 * Marks an action whose client wrapper refreshes the loaded page data once the
 * write resolves. A no-op at runtime: scripts/gen-remote-actions.mjs looks for
 * the call when it generates src/lib/actions/*.
 */
export function refreshesData(): void {}

// ---------------------------------------------------------------------------
// Input checks. Each returns the cleaned value or a Fail naming the field.
// ---------------------------------------------------------------------------

const labelOf = (field: string) => field.charAt(0).toUpperCase() + field.slice(1);

/** Form field as trimmed text ('' when absent). */
export const formField = (formData: FormData, key: string) =>
  ((formData.get(key) as string | null) ?? '').trim();

/** Trimmed, non-empty, at most `max` characters: "Name is required." / "Name must be 40 characters or fewer." */
export function requiredText<F extends string>(value: unknown, field: F, max: number): string | Fail<F> {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return fail(`${labelOf(field)} is required.`, field);
  if (text.length > max) return fail(`${labelOf(field)} must be ${max} characters or fewer.`, field);
  return text;
}

/** Trimmed, at most `max` characters, blank → null (anything but text counts as blank). */
export function optionalText<F extends string>(value: unknown, field: F, max: number): string | null | Fail<F> {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > max) return fail(`${labelOf(field)} must be ${max} characters or fewer.`, field);
  return text || null;
}

/**
 * Description that may be absent (null/undefined → null); unlike optionalText it
 * rejects non-text and measures the untrimmed length.
 */
export function descriptionOrNull(value: unknown, max: number): string | null | Fail<'description'> {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > max) {
    return fail(`Description must be ${max} characters or fewer.`, 'description');
  }
  return value.trim() || null;
}

/** `#rrggbb`, returned lower-cased. */
export function hexColor(value: unknown): string | Fail<'color'> {
  if (typeof value !== 'string' || !HEX_COLOR_RE.test(value)) {
    return fail('Color must be a hex value like #5e6ad2.', 'color');
  }
  return value.toLowerCase();
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed, lower-cased address of at most 254 characters. */
export function emailAddress(value: unknown): string | Fail<'email'> {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) return fail('Enter a valid email address.', 'email');
  return email;
}
