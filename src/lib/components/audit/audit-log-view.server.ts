// Server half of the audit log view: filters and the page cursor come from the URL;
// callers have already authorized the scope via resolveAuditScope. Call it from
// a +page.server.ts load and pass the result to <AuditLogView data={…} />:
//
//   audit: await loadAuditLogView(scope, url.searchParams, `/dashboard/workspaces/${slug}/audit`)

import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABEL,
  AUDIT_SYSTEM_ACTOR,
  auditActorOptions,
  auditConditions,
  auditFilterParams,
  decodeAuditCursor,
  encodeAuditCursor,
  parseAuditFilters,
  filtersProbeRows,
  queryAuditRows,
  type AuditCategory,
  type AuditScope,
} from '@/lib/audit';
import type { AuditActorOption } from './audit-filter-bar.svelte';

const PAGE_SIZE = 100;

type Query = URLSearchParams | Record<string, string | string[] | undefined>;

/** One row as the table renders it (only the fields it shows). */
export interface AuditLogViewRow {
  id: string;
  createdAt: Date;
  type: string;
  category: AuditCategory;
  categoryLabel: string;
  summary: string;
  actor: { id: string; name: string; email: string; image: string | null } | null;
  project: { name: string; key: string };
  /** Workspace-level event (no team): the Team column shows "—". */
  workspaceEvent: boolean;
  issue: { key: string; title: string | null; projectId: string | null } | null;
}

export interface AuditLogViewData {
  rows: AuditLogViewRow[];
  actors: AuditActorOption[];
  categories: { value: string; label: string }[];
  systemActor: string;
  /** `/api/audit?…` with the current filters, without `format`. */
  exportHref: string;
  olderHref: string | null;
  newestHref: string | null;
  filtered: boolean;
  showTeam: boolean;
}

export async function loadAuditLogView(
  scope: AuditScope,
  query: Query,
  /** The page's own path, for pagination links. */
  basePath: string,
): Promise<AuditLogViewData> {
  const filters = parseAuditFilters(query);
  const rawBefore =
    query instanceof URLSearchParams
      ? (query.get('before') ?? undefined)
      : Array.isArray(query.before)
        ? query.before[0]
        : query.before;
  const before = decodeAuditCursor(rawBefore);
  const where = await auditConditions(scope, filters);
  const [rows, actors] = await Promise.all([
    queryAuditRows(where, {
      before,
      limit: PAGE_SIZE + 1,
      viewerId: scope.viewerId,
      dropElsewhere: filtersProbeRows(filters),
    }),
    auditActorOptions(scope),
  ]);
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const filterParams = auditFilterParams(filters);
  const olderHref =
    rows.length > PAGE_SIZE && last
      ? `${basePath}?${new URLSearchParams({ ...filterParams, before: encodeAuditCursor(last) })}`
      : null;
  const newestHref = before
    ? `${basePath}${Object.keys(filterParams).length ? `?${new URLSearchParams(filterParams)}` : ''}`
    : null;
  const exportHref = `/api/audit?${new URLSearchParams({ scope: scope.kind, id: scope.id, ...filterParams })}`;

  return {
    rows: page.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      type: row.type,
      category: row.category,
      categoryLabel: AUDIT_CATEGORY_LABEL[row.category],
      summary: row.summary,
      actor: row.actor,
      project: { name: row.project.name, key: row.project.key },
      workspaceEvent: row.data.scope === 'workspace',
      issue: row.issue,
    })),
    actors,
    categories: AUDIT_CATEGORIES.map((value) => ({ value, label: AUDIT_CATEGORY_LABEL[value] })),
    systemActor: AUDIT_SYSTEM_ACTOR,
    exportHref,
    olderHref,
    newestHref,
    filtered: Object.keys(filterParams).length > 0,
    showTeam: scope.kind === 'workspace',
  };
}
