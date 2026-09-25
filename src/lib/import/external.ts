// Shared by the API importers (Asana, Shortcut): the fetch result the wizard
// previews, and user-facing errors for the provider's HTTP failures.
// Client-safe types; describeImportError is used server-side.

import type { ImportRecord } from './records';

export interface ExternalFetchResult {
  records: ImportRecord[];
  open: number;
  closed: number;
  /** Records that will become sub-issues. */
  children: number;
  /** More items exist than EXTERNAL_IMPORT_CAP. */
  truncated: boolean;
}

export function summarize(records: ImportRecord[], truncated: boolean): ExternalFetchResult {
  const closed = records.filter((r) => r.closed).length;
  return {
    records,
    open: records.length - closed,
    closed,
    children: records.filter((r) => r.parent).length,
    truncated,
  };
}

/** `status` is the provider's HTTP status (0 = network failure). */
export function describeImportError(provider: string, status: number | undefined, message: string): string {
  switch (status) {
    case 0:
      return `Couldn't reach ${provider}. Try again.`;
    case 401:
      return `${provider} rejected the token. Check it's a valid personal access token.`;
    case 403:
      return `${provider} denied access with this token.`;
    case 404:
      return `Not found on ${provider}, or the token can't see it.`;
    case 429:
      return `${provider} rate-limited the import. Wait a minute and try again.`;
    default:
      return `${provider} error${status ? ` (${status})` : ''}: ${message}`;
  }
}
