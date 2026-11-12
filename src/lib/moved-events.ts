// What the activity of an issue that moved between projects may reveal to its
// reader. A move rewrites the `project_id` of every activity row of the issue,
// so rows recorded while it lived in another project travel with it: their
// `key`, state / label / cycle names, titles and descriptions edited there,
// and the move rows' `fromKey` / `toKey` / `droppedLabels`. Nothing is
// rewritten; every reader that has a viewer passes its rows through
// `redactActivityFor`, which
//   - collapses each row recorded while the issue was in a project the viewer
//     is not a member of into a neutral "activity in another project" entry
//     (no actor, no data but that summary) — one entry per row, so paging by
//     (createdAt, id) is unchanged;
//   - and strips, from the issue.moved rows it keeps, the other project's id
//     and key unless the viewer is a member there (redactMovedData).
// Membership is what counts: a workspace admin who is not a member of the
// other project is a non-member there.
//
// Which project a row was recorded in: the issue's target-side issue.moved
// rows (one per move, always with `fromProjectId` / `toProjectId`, stored in
// the move's transaction) split its history by `createdAt`. Before the first
// move → its `fromProjectId`; between two moves → the earlier one's
// `toProjectId`; a move row itself → its `toProjectId`. A row stamped at the
// exact instant of a move belongs to either side, and is shown only if the
// viewer is a member of both (fail closed). Rows without a ticket stay where
// they were written (source-side move rows, purges).
//
// Readers: the issue timeline (UI, MCP get_issue, REST), the audit log and
// its export, the member profile feed (redactActivityFor), and outgoing
// webhooks (a project-scoped receiver sees only its own project:
// redactMovedData). Slack and notifications never render moves.

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { activities, projectMembers } from "@/db/schema";
import { db } from "@/lib/db";
import { ISSUE_EVENT } from "@/lib/event-names";

const str = (value: unknown) =>
  typeof value === "string" && value ? value : null;

/** Read-time type of a collapsed row (never stored). */
export const ELSEWHERE_ACTIVITY_TYPE = "issue.activity_elsewhere";
export const ELSEWHERE_SUMMARY = "activity in another project";

/** Project ids an issue.moved row names, other than the one it is stored in. */
function namedProjects(data: Record<string, unknown>): string[] {
  return [str(data.toProjectId), str(data.fromProjectId)].filter(
    (id): id is string => id !== null,
  );
}

/**
 * `data` as a reader who can see only the projects `canSee` accepts may read
 * it. Not an issue.moved row → returned as is. A row of the target side
 * (`fromProjectId` set) loses the source's id, keys and dropped label names
 * when the source is hidden; any row loses the target's id and key when the
 * target is hidden (a row with a `toKey` but no `toProjectId` is treated as
 * hidden).
 */
export function redactMovedData(
  type: string,
  data: Record<string, unknown>,
  canSee: (projectId: string) => boolean,
): Record<string, unknown> {
  if (type !== ISSUE_EVENT.moved) return data;
  const to = str(data.toProjectId);
  const from = str(data.fromProjectId);
  const hideTo = to ? !canSee(to) : "toKey" in data;
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
    // The source project's label names.
    delete out.droppedLabels;
  }
  if (targetSide) {
    if (hideFrom) out.summary = "moved from another project";
  } else if (hideTo) {
    const own = str(data.fromKey) ?? str(data.key);
    out.summary = own
      ? `moved ${own} to another project`
      : "moved an issue to another project";
  }
  return out;
}

interface Move {
  id: string;
  at: number;
  from: string;
  to: string;
}

/** The projects `row` may have been recorded in (one, or two at a move's exact instant). */
export function recordedIn(
  row: {
    id: string;
    createdAt: Date;
    ticketId: string | null;
    projectId: string;
  },
  moves: Move[] | undefined,
): string[] {
  if (!row.ticketId || !moves || moves.length === 0) return [row.projectId];
  const own = moves.find((move) => move.id === row.id);
  if (own) return [own.to];
  const at = row.createdAt.getTime();
  const out = new Set<string>();
  for (let i = 0; i <= moves.length; i++) {
    // Segment i: after move i-1 (or the start), before move i (or the end).
    const start = i === 0 ? -Infinity : moves[i - 1].at;
    const end = i === moves.length ? Infinity : moves[i].at;
    if (at >= start && at <= end)
      out.add(i === 0 ? moves[0].from : moves[i - 1].to);
  }
  return [...out];
}

type ActivityRow = {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  createdAt: Date;
  ticketId: string | null;
  projectId: string;
};

const ACTOR_FIELDS = [
  "actorId",
  "actorName",
  "actorEmail",
  "actorImage",
] as const;

/**
 * `rows` as `viewerId` may read them (see the top of this file). Two queries
 * at most: the issues' target-side moves and the viewer's memberships in the
 * projects they name.
 */
export async function redactActivityFor<T extends ActivityRow>(
  rows: T[],
  viewerId: string,
): Promise<T[]> {
  const ticketIds = [
    ...new Set(
      rows.map((row) => row.ticketId).filter((id): id is string => id !== null),
    ),
  ];
  const moveRows = ticketIds.length
    ? await db
        .select({
          id: activities.id,
          ticketId: activities.ticketId,
          createdAt: activities.createdAt,
          from: sql<string | null>`${activities.data} ->> 'fromProjectId'`,
          to: sql<string | null>`${activities.data} ->> 'toProjectId'`,
        })
        .from(activities)
        .where(
          and(
            inArray(activities.ticketId, ticketIds),
            eq(activities.type, ISSUE_EVENT.moved),
            isNotNull(sql`${activities.data} ->> 'fromProjectId'`),
          ),
        )
    : [];
  const movesByTicket = new Map<string, Move[]>();
  for (const move of moveRows) {
    if (!move.ticketId || !move.from || !move.to) continue;
    const list = movesByTicket.get(move.ticketId) ?? [];
    list.push({
      id: move.id,
      at: move.createdAt.getTime(),
      from: move.from,
      to: move.to,
    });
    movesByTicket.set(move.ticketId, list);
  }
  for (const list of movesByTicket.values())
    list.sort((x, y) => x.at - y.at || x.id.localeCompare(y.id));

  const origins = rows.map((row) =>
    recordedIn(row, row.ticketId ? movesByTicket.get(row.ticketId) : undefined),
  );
  const named = new Set<string>();
  rows.forEach((row, i) => {
    for (const id of origins[i]) if (id !== row.projectId) named.add(id);
    if (row.type === ISSUE_EVENT.moved && row.data)
      for (const id of namedProjects(row.data)) named.add(id);
  });
  const memberships = named.size
    ? await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.userId, viewerId),
            inArray(projectMembers.projectId, [...named]),
          ),
        )
    : [];
  const visible = new Set(memberships.map((m) => m.projectId));

  return rows.map((row, i) => {
    // The row's own (current) project is what the reader already authorized.
    const canSee = (id: string) => id === row.projectId || visible.has(id);
    if (!origins[i].every(canSee)) {
      const collapsed: Record<string, unknown> = {
        ...row,
        type: ELSEWHERE_ACTIVITY_TYPE,
        data: { summary: ELSEWHERE_SUMMARY },
      };
      for (const field of ACTOR_FIELDS)
        if (field in collapsed) collapsed[field] = null;
      return collapsed as T;
    }
    return row.type === ISSUE_EVENT.moved && row.data
      ? { ...row, data: redactMovedData(row.type, row.data, canSee) }
      : row;
  });
}
