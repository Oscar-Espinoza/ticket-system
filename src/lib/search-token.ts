/** Appends `token` to a search query with a separating space (and a trailing one to keep typing). */
export function appendToken(query: string, token: string): string {
  const base = query.trimEnd();
  return base ? `${base} ${token} ` : `${token} `;
}
