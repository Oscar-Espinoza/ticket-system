'use server';

// Ticket mutations (GSD Phase 5: TKT-01…06). Every action resolves the session,
// runs requireProjectMember BEFORE touching ticket rows, and scopes each write by
// (ticket id, project id) so a ticket id from another project matches nothing.

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, tickets } from '@/db/schema';
import { requireProjectMember, ProjectAccessError } from '@/lib/project-access';
import { getTicketById } from '@/lib/tickets';
import { isTicketStatus, type IssueRow, type TicketStatus } from '@/lib/issue-model';

export type TicketActionResult =
  | { ok: true; ticket?: IssueRow }
  | { ok: false; error: string; field?: 'title' | 'description' };

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 10_000;

type Authorized = { ok: true; userId: string } | { ok: false; error: string };

async function authorize(projectId: unknown): Promise<Authorized> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: 'Not authenticated' };
  if (typeof projectId !== 'string' || !projectId) {
    return { ok: false, error: 'Forbidden' };
  }
  try {
    await requireProjectMember(projectId, session.user.id);
  } catch (err) {
    if (err instanceof ProjectAccessError) return { ok: false, error: 'Forbidden' };
    throw err;
  }
  return { ok: true, userId: session.user.id };
}

function revalidateProject(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`);
  // Project list open/resolved counts.
  revalidatePath('/dashboard');
}

function validateTitle(title: unknown): string | TicketActionResult {
  const value = typeof title === 'string' ? title.trim() : '';
  if (!value) return { ok: false, error: 'Title is required.', field: 'title' };
  if (value.length > TITLE_MAX) {
    return {
      ok: false,
      error: `Title must be ${TITLE_MAX} characters or fewer.`,
      field: 'title',
    };
  }
  return value;
}

function validateDescription(
  description: unknown,
): string | null | TicketActionResult {
  if (description == null) return null;
  if (typeof description !== 'string') {
    return { ok: false, error: 'Invalid description.', field: 'description' };
  }
  const value = description.trim();
  if (value.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
      field: 'description',
    };
  }
  return value || null;
}

const NOT_FOUND: TicketActionResult = { ok: false, error: 'Issue not found.' };

export async function createTicket(input: {
  projectId: string;
  title: string;
  description?: string | null;
  status?: TicketStatus;
}): Promise<TicketActionResult> {
  const authz = await authorize(input.projectId);
  if (!authz.ok) return authz;

  const title = validateTitle(input.title);
  if (typeof title !== 'string') return title;
  const description = validateDescription(input.description);
  if (description !== null && typeof description !== 'string') return description;
  const status = input.status ?? 'backlog';
  if (!isTicketStatus(status)) return { ok: false, error: 'Invalid status.' };

  const id = crypto.randomUUID();
  // ISO string, not Date: raw sql params skip Drizzle's column mapping and the
  // driver would serialize a Date in server-local time.
  const now = new Date().toISOString();

  // One statement: the UPDATE row-locks the project, so concurrent creates get
  // distinct numbers; unique(project_id, ticket_number) is the backstop.
  const result = await db.execute(sql`
    with counter as (
      update ${projects}
      set ticket_counter = ticket_counter + 1
      where id = ${input.projectId}
      returning ticket_counter
    )
    insert into ${tickets}
      (id, project_id, ticket_number, title, description, status, created_at, updated_at)
    select ${id}, ${input.projectId}, counter.ticket_counter, ${title},
      ${description}, ${status}::ticket_status, ${now}, ${now}
    from counter
    returning id
  `);
  if (result.rows.length === 0) return { ok: false, error: 'Project not found.' };

  revalidateProject(input.projectId);
  const ticket = await getTicketById(input.projectId, id);
  return { ok: true, ticket: ticket ?? undefined };
}

export async function updateTicket(input: {
  projectId: string;
  id: string;
  title?: string;
  description?: string | null;
}): Promise<TicketActionResult> {
  const authz = await authorize(input.projectId);
  if (!authz.ok) return authz;

  const changes: { title?: string; description?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (input.title !== undefined) {
    const title = validateTitle(input.title);
    if (typeof title !== 'string') return title;
    changes.title = title;
  }
  if (input.description !== undefined) {
    const description = validateDescription(input.description);
    if (description !== null && typeof description !== 'string') return description;
    changes.description = description;
  }

  const updated = await db
    .update(tickets)
    .set(changes)
    .where(and(eq(tickets.id, input.id), eq(tickets.projectId, input.projectId)))
    .returning({ id: tickets.id });
  if (updated.length === 0) return NOT_FOUND;

  revalidateProject(input.projectId);
  return { ok: true };
}

export async function deleteTicket(input: {
  projectId: string;
  id: string;
}): Promise<TicketActionResult> {
  const authz = await authorize(input.projectId);
  if (!authz.ok) return authz;

  const deleted = await db
    .delete(tickets)
    .where(and(eq(tickets.id, input.id), eq(tickets.projectId, input.projectId)))
    .returning({ id: tickets.id });
  if (deleted.length === 0) return NOT_FOUND;

  revalidateProject(input.projectId);
  return { ok: true };
}

export async function assignTicket(input: {
  projectId: string;
  id: string;
  assigneeId: string | null;
}): Promise<TicketActionResult> {
  const authz = await authorize(input.projectId);
  if (!authz.ok) return authz;

  if (input.assigneeId !== null) {
    try {
      await requireProjectMember(input.projectId, input.assigneeId);
    } catch (err) {
      if (err instanceof ProjectAccessError) {
        return { ok: false, error: 'Assignee must be a project member.' };
      }
      throw err;
    }
  }

  const updated = await db
    .update(tickets)
    .set({ assigneeId: input.assigneeId, updatedAt: new Date() })
    .where(and(eq(tickets.id, input.id), eq(tickets.projectId, input.projectId)))
    .returning({ id: tickets.id });
  if (updated.length === 0) return NOT_FOUND;

  revalidateProject(input.projectId);
  return { ok: true };
}

export async function setTicketStatus(input: {
  projectId: string;
  id: string;
  status: TicketStatus;
}): Promise<TicketActionResult> {
  const authz = await authorize(input.projectId);
  if (!authz.ok) return authz;
  if (!isTicketStatus(input.status)) return { ok: false, error: 'Invalid status.' };

  const updated = await db
    .update(tickets)
    .set({ status: input.status, updatedAt: new Date() })
    .where(and(eq(tickets.id, input.id), eq(tickets.projectId, input.projectId)))
    .returning({ id: tickets.id });
  if (updated.length === 0) return NOT_FOUND;

  revalidateProject(input.projectId);
  return { ok: true };
}
