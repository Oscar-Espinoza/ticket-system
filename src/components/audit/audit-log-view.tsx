// Audit log table for a resolved scope (project or workspace). Server
// component: filters and the page cursor come from the URL; callers have
// already authorized the scope via resolveAuditScope.

import Link from 'next/link';
import { Bot, ScrollText } from 'lucide-react';

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
  queryAuditRows,
  type AuditCategory,
  type AuditScope,
} from '@/lib/audit';
import { issuePath } from '@/lib/issue-links';
import { Timestamp } from '@/components/comments/timestamp';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, EmptyState, LabelChip, type LabelChipColor } from '@/components/ui-icons';
import { AuditFilterBar } from './audit-filter-bar';

const PAGE_SIZE = 100;

const CATEGORY_COLOR: Record<AuditCategory, LabelChipColor> = {
  issues: 'todo',
  comments: 'backlog',
  planning: 'in_progress',
  members: 'in_review',
  settings: 'default',
  security: 'destructive',
  integrations: 'done',
  other: 'default',
};

type Query = Record<string, string | string[] | undefined>;

export async function AuditLogView({
  scope,
  query,
  basePath,
}: {
  scope: AuditScope;
  query: Query;
  /** The page's own path, for pagination links. */
  basePath: string;
}) {
  const filters = parseAuditFilters(query);
  const rawBefore = Array.isArray(query.before) ? query.before[0] : query.before;
  const before = decodeAuditCursor(rawBefore);
  const where = await auditConditions(scope, filters);
  const [rows, actors] = await Promise.all([
    queryAuditRows(where, { before, limit: PAGE_SIZE + 1 }),
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
  const filtered = Object.keys(filterParams).length > 0;
  const showTeam = scope.kind === 'workspace';

  return (
    <div className="flex flex-col gap-4">
      <AuditFilterBar
        actors={actors}
        categories={AUDIT_CATEGORIES.map((value) => ({ value, label: AUDIT_CATEGORY_LABEL[value] }))}
        systemActor={AUDIT_SYSTEM_ACTOR}
        exportHref={exportHref}
      />

      {page.length === 0 ? (
        <EmptyState
          className="rounded-lg border border-dashed border-border py-10"
          icon={<ScrollText />}
          title={filtered ? 'No matching events' : 'No events yet'}
          description={
            filtered
              ? 'Try a wider date range or clear the filters.'
              : 'Issue changes, member and role changes, and security events will show up here.'
          }
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Time</TableHead>
                <TableHead className="w-44">Actor</TableHead>
                <TableHead>Event</TableHead>
                {showTeam && <TableHead className="w-20">Team</TableHead>}
                <TableHead className="w-24">Issue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.map((row) => (
                <TableRow key={row.id} className="text-sm">
                  <TableCell className="text-muted-foreground">
                    <Timestamp date={row.createdAt} />
                  </TableCell>
                  <TableCell>
                    {row.actor ? (
                      <span className="flex min-w-0 items-center gap-2" title={row.actor.email}>
                        <Avatar name={row.actor.name} src={row.actor.image} size={20} />
                        <span className="truncate">{row.actor.name}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Bot aria-hidden="true" className="size-4" />
                        System
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 whitespace-normal">
                    <span className="flex min-w-0 items-start gap-2">
                      <LabelChip color={CATEGORY_COLOR[row.category]} className="shrink-0">
                        {AUDIT_CATEGORY_LABEL[row.category]}
                      </LabelChip>
                      <span className="line-clamp-2 min-w-0 break-words" title={row.type}>
                        {row.summary}
                      </span>
                    </span>
                  </TableCell>
                  {showTeam && (
                    <TableCell className="font-mono text-xs text-muted-foreground" title={row.project.name}>
                      {row.data.scope === 'workspace' ? '—' : row.project.key}
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-xs">
                    {row.issue ? (
                      row.issue.projectId ? (
                        <Link
                          href={issuePath(row.issue.projectId, row.issue.key)}
                          className="hover:underline"
                          title={row.issue.title ?? undefined}
                        >
                          {row.issue.key}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground" title={row.issue.title ?? undefined}>
                          {row.issue.key}
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(olderHref || newestHref) && (
        <div className="flex items-center justify-end gap-2">
          {newestHref && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={newestHref}>Newest</Link>
            </Button>
          )}
          {olderHref && (
            <Button variant="outline" size="sm" asChild>
              <Link href={olderHref}>Older events</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
