// Shared by the API importers (Asana, Shortcut): the fetch result the wizard
// previews, and user-facing errors for the provider's HTTP failures.
// Client-safe types; describeImportError is used server-side.

import { m } from '@/lib/i18n';
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
      return m.common_import_unreachable({ provider });
    case 401:
      return m.common_import_token_rejected({ provider });
    case 403:
      return m.common_import_denied({ provider });
    case 404:
      return m.common_import_not_found({ provider });
    case 429:
      return m.common_import_rate_limited({ provider });
    default:
      return status ? m.common_import_error_status({ provider, status, message }) : m.common_import_error({ provider, message });
  }
}
