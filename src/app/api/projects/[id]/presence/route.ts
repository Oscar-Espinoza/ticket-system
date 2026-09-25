// Presence: who else is in this project right now, and which issue they're on.
//   POST { ticketId: string | null, leave?: true } — heartbeat (every ~15 s) or
//        leave (sendBeacon on pagehide); responds like GET.
//   GET  → { users: [{ id, name, image, ticketId }] } — other members seen in
//        the last 45 s (the viewer is never included).

import { and, eq, gt, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { presence, projectMembers, users } from '@/db/schema';
import { ProjectAccessError, requireProjectMember } from '@/lib/project-access';
import { getSession } from '@/lib/session';

const WINDOW_MS = 45_000;
const NO_STORE = { 'Cache-Control': 'no-store' };

interface PresenceUser {
  id: string;
  name: string;
  image: string | null;
  ticketId: string | null;
}

type Auth = { ok: true; projectId: string; userId: string } | { ok: false; response: Response };

async function authorize(ctx: { params: Promise<{ id: string }> }): Promise<Auth> {
  const [{ id }, session] = await Promise.all([ctx.params, getSession()]);
  if (!session?.user) {
    return { ok: false, response: Response.json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE }) };
  }
  try {
    await requireProjectMember(id, session.user.id);
  } catch (err) {
    if (!(err instanceof ProjectAccessError)) throw err;
    return { ok: false, response: Response.json({ error: 'Not found' }, { status: 404, headers: NO_STORE }) };
  }
  return { ok: true, projectId: id, userId: session.user.id };
}

function othersQuery(projectId: string, userId: string) {
  return db
    .select({ id: users.id, name: users.name, image: users.image, ticketId: presence.ticketId })
    .from(presence)
    .innerJoin(users, eq(presence.userId, users.id))
    // Removed members vanish immediately, even with a fresh row.
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, presence.projectId), eq(projectMembers.userId, presence.userId)),
    )
    .where(
      and(
        eq(presence.projectId, projectId),
        ne(presence.userId, userId),
        gt(presence.lastSeenAt, new Date(Date.now() - WINDOW_MS)),
      ),
    )
    .orderBy(users.name);
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(ctx);
  if (!auth.ok) return auth.response;
  const others: PresenceUser[] = await othersQuery(auth.projectId, auth.userId);
  return Response.json({ users: others }, { headers: NO_STORE });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(ctx);
  if (!auth.ok) return auth.response;
  const { projectId, userId } = auth;

  const body = (await request.json().catch(() => null)) as { ticketId?: unknown; leave?: unknown } | null;
  if (body?.leave === true) {
    await db.delete(presence).where(and(eq(presence.userId, userId), eq(presence.projectId, projectId)));
    return new Response(null, { status: 204, headers: NO_STORE });
  }

  const ticketId = typeof body?.ticketId === 'string' && body.ticketId.length <= 64 ? body.ticketId : null;
  const now = new Date();
  // The ticket id is untrusted: keep it only if it's a live issue of this project.
  const ticket = ticketId
    ? sql`(select id from ticket where id = ${ticketId} and project_id = ${projectId} and deleted_at is null)`
    : null;
  const [, others] = await db.batch([
    db
      .insert(presence)
      .values({ userId, projectId, ticketId: ticket, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [presence.userId, presence.projectId],
        set: { ticketId: sql`excluded.ticket_id`, lastSeenAt: now },
      }),
    othersQuery(projectId, userId),
  ]);
  return Response.json({ users: others satisfies PresenceUser[] }, { headers: NO_STORE });
}
