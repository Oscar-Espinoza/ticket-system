// Untrusted-input text helpers shared by server actions and webhook readers.

/** The trimmed string cut to `max` characters; null for a non-string or blank value. */
export function clippedText(value: unknown, max: number): string | null {
  return typeof value === 'string' ? value.trim().slice(0, max) || null : null;
}

/** `clippedText`, with '' instead of null. */
export function clippedTextOrEmpty(value: unknown, max: number): string {
  return clippedText(value, max) ?? '';
}
