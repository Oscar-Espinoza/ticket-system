// Delimiters around matched terms in search titles and snippets. The server
// puts them in (Postgres ts_headline); the UI turns them back into <mark>.
// Client-safe.

/** Unicode private use area: never typed by users. */
export const MARK_START = '\ue000';
export const MARK_END = '\ue001';
