// Next's `searchParams` shape for one key: a string, an array when the key is
// repeated, or undefined. The auth pages pass it to safeRedirect() exactly as
// the Next pages did (a repeated `?redirect=` is not a string → /dashboard).

export function searchParam(url: URL, key: string): string | string[] | undefined {
  const values = url.searchParams.getAll(key);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

/** First value of a possibly repeated key (the Next pages' `first()`). */
export function firstParam(url: URL, key: string): string | undefined {
  return url.searchParams.get(key) ?? undefined;
}
