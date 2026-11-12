// What an `issue.moved` row may reveal to its reader. A move writes one row in
// the source project (no ticket; `toProjectId`, `toKey`) and one per moved
// issue in the target (`fromProjectId`, `fromKey`, `withParent`, plus the new
// `key` / `toKey`). The rows keep everything — the target side and the move
// guard need it — and every reader strips the OTHER project's id and key unless
// its viewer is a member there (private projects are members-only). Rows that
// travel with the issue (a later move back) are covered too, as are rows
// written before this existed: nothing is rewritten.
//
// Readers: the issue timeline, the audit log and its export, the member
// profile feed (one viewer each: redactMovedEventsFor) and outgoing webhooks
// (a project-scoped receiver sees only its own project). Slack and
// notifications never render moves.

import { and, eq, inArray } from 'drizzle-orm';

import { projectMembers } from '@/db/schema';
import { db } from '@/lib/db';
import { ISSUE_EVENT } from '@/lib/event-names';

const str = (value: unknown) => (typeof value === 'string' && value ? value : null);

/** Project ids an issue.moved row names, other than the one it is stored in. */
function namedProjects(data: Record<string, unknown>): string[] {
  return [str(data.toProjectId), str(data.fromProjectId)].filter((id): id is string => id !== null);
}

/**
 * `data` as a reader who can see only the projects `canSee` accepts may read
 * it. Not an issue.moved row → returned as is. A row of the target side
 * (`fromProjectId` set) loses the source's id and keys when the source is
 * hidden; any row loses the target's id and key when the target is hidden
 * (a row with a `toKey` but no `toProjectId` is treated as hidden).
 */
export function redactMovedData(
  type: string,
  data: Record<string, unknown>,
  canSee: (projectId: string) => boolean,
): Record<string, unknown> {
  if (type !== ISSUE_EVENT.moved) return data;
  const to = str(data.toProjectId);
  const from = str(data.fromProjectId);
  const hideTo = to ? !canSee(to) : 'toKey' in data;
  const hideFrom = from ? !canSee(from) : false;
  if (!hideTo && !hideFrom) return data;

  const out = { ...data };
  const targetSide = from !== null;
  if (hideTo) {
    delete out.toProjectId;
    delete out.toKey;
    // On the target side `key` is the issue's key there.
    if (targetSide) delete out.key;
  }
  if (hideFrom) {
    delete out.fromProjectId;
    delete out.fromKey;
    delete out.withParent;
  }
  if (targetSide) {
    if (hideFrom) out.summary = 'moved from another project';
  } else if (hideTo) {
    const own = str(data.fromKey) ?? str(data.key);
    out.summary = own ? `moved ${own} to another project` : 'moved an issue to another project';
  }
  return out;
}

/**
 * `rows` with every issue.moved row's data redacted for `viewerId`: a project
 * the row names stays only when the viewer is a member of it. One membership
 * query for the projects the rows name.
 */
export async function redactMovedEventsFor<
  T extends { type: string; data: Record<string, unknown> | null },
>(rows: T[], viewerId: string): Promise<T[]> {
  const named = [
    ...new Set(rows.flatMap((row) => (row.type === ISSUE_EVENT.moved && row.data ? namedProjects(row.data) : []))),
  ];
  if (named.length === 0) return rows;
  const memberships = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, viewerId), inArray(projectMembers.projectId, named)));
  const visible = new Set(memberships.map((m) => m.projectId));
  return rows.map((row) =>
    row.type === ISSUE_EVENT.moved && row.data
      ? { ...row, data: redactMovedData(row.type, row.data, (id) => visible.has(id)) }
      : row,
  );
}
