// Audit log export: GET /api/audit?scope=project|workspace&id=…&format=csv|json
// (+ from, to, actor, category, issue — the audit page's filters).
//
// Session auth; project owner/admin or workspace owner/admin (resolveAuditScope)
// — anyone else gets 404 so ids can't be probed. Newest first, streamed in
// 1,000-row pages, capped at 50,000 rows. Each export is itself audited.

import type { NextRequest } from 'next/server';

import { getSession } from '@/lib/session';
import {
  auditConditions,
  auditExportRecord,
  parseAuditFilters,
  queryAuditRows,
  recordProjectEvent,
  recordWorkspaceEvent,
  resolveAuditScope,
  type AuditCursor,
} from '@/lib/audit';
import { toCsv } from '@/lib/import/csv';

const CHUNK = 1_000;
const MAX_ROWS = 50_000;

const CSV_HEADER = [
  'ID',
  'Time (UTC)',
  'Actor ID',
  'Actor',
  'Actor Email',
  'Type',
  'Category',
  'Summary',
  'Team Key',
  'Team',
  'Issue',
  'Issue Title',
  'Data',
];

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) return new Response('Not authenticated', { status: 401 });

  const params = request.nextUrl.searchParams;
  const scope = await resolveAuditScope(params.get('scope'), params.get('id'), session.user.id);
  if (!scope) return new Response('Not found', { status: 404 });

  const format = params.get('format') === 'json' ? 'json' : 'csv';
  const filters = parseAuditFilters(params);
  const where = await auditConditions(scope, filters);

  const range = [filters.from, filters.to].filter(Boolean).join(' to ');
  const event = {
    actorId: session.user.id,
    type: 'security.audit_exported',
    summary: `exported the audit log as ${format.toUpperCase()}${range ? ` (${range})` : ''}`,
    data: { format, filters },
  };
  if (scope.kind === 'project') await recordProjectEvent(scope.id, event);
  else await recordWorkspaceEvent(scope.id, event);

  const encoder = new TextEncoder();
  let cursor: AuditCursor | null = null;
  let sent = 0;
  let started = false;

  // Pull-based: the next page is only read when the client is ready for it.
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(
            encoder.encode(
              format === 'csv'
                ? toCsv([CSV_HEADER])
                : `{"scope":${JSON.stringify({ kind: scope.kind, id: scope.id, name: scope.name })},"exportedAt":${JSON.stringify(new Date().toISOString())},"filters":${JSON.stringify(filters)},"events":[`,
            ),
          );
          return;
        }
        const limit = Math.min(CHUNK, MAX_ROWS - sent);
        const rows = limit > 0 ? await queryAuditRows(where, { before: cursor, limit }) : [];
        if (rows.length > 0) {
          const records = rows.map(auditExportRecord);
          const chunk =
            format === 'csv'
              ? // toCsv prefixes a BOM; only the header chunk keeps it.
                toCsv(
                  records.map((r) => [
                    r.id,
                    r.createdAt,
                    r.actorId,
                    r.actorName,
                    r.actorEmail,
                    r.type,
                    r.category,
                    r.summary,
                    r.teamKey,
                    r.teamName,
                    r.issueKey,
                    r.issueTitle,
                    JSON.stringify(r.data),
                  ]),
                ).slice(1)
              : records.map((r, i) => `${sent + i > 0 ? ',' : ''}\n${JSON.stringify(r)}`).join('');
          controller.enqueue(encoder.encode(chunk));
          sent += rows.length;
          const last = rows[rows.length - 1];
          cursor = { createdAt: last.createdAt, id: last.id };
        }
        if (rows.length < limit || limit === 0 || sent >= MAX_ROWS) {
          if (format === 'json') {
            controller.enqueue(
              encoder.encode(`\n],"count":${sent},"truncated":${sent >= MAX_ROWS}}\n`),
            );
          }
          controller.close();
        }
      } catch (err) {
        console.error('[audit] export failed', err);
        controller.error(err);
      }
    },
  });

  const slug = scope.kind === 'project' ? scope.ticketKey : scope.slug;
  const date = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      'Content-Type':
        format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-audit-log-${date}.${format}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
