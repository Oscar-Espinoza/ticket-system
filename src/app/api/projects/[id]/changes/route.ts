// Change token for live updates (polled every ~5 s by LiveUpdates — no
// websockets on the free tier). ONE SQL statement checks membership and hashes
// cheap aggregates of everything a project page shows; when the hash moves,
// clients router.refresh(). Aggregates ride the project_id indexes.

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([ctx.params, getSession()]);
  if (!session?.user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE });

  const { rows } = await db.execute<{ member: boolean; token: string | null }>(sql`
    select
      exists (
        select 1 from project_member where project_id = ${id} and user_id = ${session.user.id}
      ) as member,
      md5(concat_ws('|',
        (select updated_at from project where id = ${id}),
        (select concat_ws(':', count(*), max(updated_at)) from ticket where project_id = ${id}),
        (select max(created_at) from activity where project_id = ${id}),
        (select max(c.updated_at) from comment c join ticket t on t.id = c.ticket_id
          where t.project_id = ${id}),
        (select md5(string_agg(concat_ws(',', id, name, color), ';' order by id))
          from label where project_id = ${id}),
        (select md5(string_agg(concat_ws(',', id, name, color, type, position), ';' order by id))
          from workflow_state where project_id = ${id}),
        (select md5(string_agg(concat_ws(',', id, name, starts_at, ends_at, completed_at), ';' order by id))
          from cycle where project_id = ${id}),
        (select concat_ws(':', count(*), max(updated_at)) from epic where project_id = ${id}),
        (select count(*) from project_member where project_id = ${id})
      )) as token
  `);
  const row = rows[0];
  // Non-members get the same 404 as a missing project (no id probing).
  if (!row?.member) return Response.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  return Response.json({ token: row.token }, { headers: NO_STORE });
}
