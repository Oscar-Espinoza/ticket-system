// "APP-12" → the issue's id + project id, following ticket_key_alias for issues
// that moved to another project. No authorization: callers check the viewer's
// role in the returned project (REST v1 and GraphQL both do).

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects, ticketKeyAliases, tickets } from '@/db/schema';

const ISSUE_KEY = /^([A-Za-z0-9]{1,10})-(\d{1,9})$/;

export async function resolveIssueKey(
  key: string,
): Promise<{ id: string; projectId: string } | null> {
  const match = key.trim().match(ISSUE_KEY);
  if (!match) return null;
  const normalized = `${match[1].toUpperCase()}-${match[2]}`;

  const [current, alias] = await db.batch([
    db
      .select({ id: tickets.id, projectId: tickets.projectId })
      .from(tickets)
      .innerJoin(projects, eq(projects.id, tickets.projectId))
      .where(
        and(eq(projects.ticketKey, match[1].toUpperCase()), eq(tickets.ticketNumber, Number(match[2]))),
      )
      .limit(1),
    db
      .select({ id: tickets.id, projectId: tickets.projectId })
      .from(ticketKeyAliases)
      .innerJoin(tickets, eq(tickets.id, ticketKeyAliases.ticketId))
      .where(eq(ticketKeyAliases.key, normalized))
      .limit(1),
  ]);
  return current[0] ?? alias[0] ?? null;
}
