// Change token for live updates (server only). ONE SQL statement checks
// membership and hashes cheap aggregates of everything a project page shows;
// when the hash moves, clients router.refresh(). Aggregates ride the project_id
// indexes. Used by the polling (`changes`) and SSE (`stream`) routes.

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';

/** The project's current change token, or null when `userId` isn't a member (or it doesn't exist). */
export async function getChangeToken(projectId: string, userId: string): Promise<string | null> {
  const { rows } = await db.execute<{ member: boolean; token: string | null }>(sql`
    select
      exists (
        select 1 from project_member where project_id = ${projectId} and user_id = ${userId}
      ) as member,
      md5(concat_ws('|',
        (select updated_at from project where id = ${projectId}),
        (select concat_ws(':', count(*), max(updated_at)) from ticket where project_id = ${projectId}),
        (select max(created_at) from activity where project_id = ${projectId}),
        (select max(c.updated_at) from comment c join ticket t on t.id = c.ticket_id
          where t.project_id = ${projectId}),
        (select md5(string_agg(concat_ws(',', id, name, color), ';' order by id))
          from label where project_id = ${projectId}),
        (select md5(string_agg(concat_ws(',', id, name, color, type, position), ';' order by id))
          from workflow_state where project_id = ${projectId}),
        (select md5(string_agg(concat_ws(',', id, name, starts_at, ends_at, completed_at), ';' order by id))
          from cycle where project_id = ${projectId}),
        (select concat_ws(':', count(*), max(updated_at)) from epic where project_id = ${projectId}),
        (select count(*) from project_member where project_id = ${projectId})
      )) as token
  `);
  const row = rows[0];
  return row?.member ? (row.token ?? '') : null;
}
