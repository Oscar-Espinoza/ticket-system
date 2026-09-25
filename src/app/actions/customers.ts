'use server';

// Customer + customer-request mutations. Every action authorizes with
// authorizeProjectAction first and scopes each write by (id, projectId), so ids
// from another project match nothing. Referenced tickets, customers and owners
// are validated against the project before anything is written.

import { revalidatePath } from 'next/cache';
import { and, arrayOverlaps, eq, ne } from 'drizzle-orm';

import { db } from '@/lib/db';
import { customerRequests, customers, projectMembers, projects, tickets } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { emitIssueEvent } from '@/lib/events';
import { getCustomerOptions, getIssueCustomerRequests } from '@/lib/customers';
import {
  CUSTOMER_DOMAINS_MAX,
  CUSTOMER_NAME_MAX,
  CUSTOMER_NOTES_MAX,
  CUSTOMER_TIER_MAX,
  IMPORTANCE_LABEL,
  INT_MAX,
  REQUEST_BODY_MAX,
  isCustomerStatus,
  isImportance,
  isPublicMailDomain,
  normalizeDomain,
  type CustomerOption,
  type CustomerStatus,
  type Importance,
  type IssueCustomerRequest,
} from '@/components/customers/customer-model';

type Fail = { ok: false; error: string; field?: string };
export type CustomerActionResult<T = object> = ({ ok: true } & T) | Fail;

const fail = (error: string, field?: string): Fail => ({ ok: false, error, field });
const isFail = (value: unknown): value is Fail =>
  typeof value === 'object' && value !== null && (value as Fail).ok === false;
const deny = (error: string) =>
  fail(error === 'Forbidden' ? "You don't have permission to do that in this project." : error);

function revalidate(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}/customers`, 'layout');
}

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface CustomerInput {
  name?: string;
  domains?: string[];
  status?: CustomerStatus;
  tier?: string | null;
  revenue?: number | null;
  size?: number | null;
  ownerId?: string | null;
  notes?: string | null;
}

type CustomerChanges = Partial<{
  name: string;
  domains: string[];
  status: CustomerStatus;
  tier: string | null;
  revenue: number | null;
  size: number | null;
  ownerId: string | null;
  notes: string | null;
}>;

function validName(value: unknown): string | Fail {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return fail('Name is required.', 'name');
  if (trimmed.length > CUSTOMER_NAME_MAX) {
    return fail(`Name must be ${CUSTOMER_NAME_MAX} characters or fewer.`, 'name');
  }
  return trimmed;
}

function validAmount(value: unknown, field: string, label: string): number | null | Fail {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(`${label} must be a number.`, field);
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > INT_MAX) return fail(`${label} is out of range.`, field);
  return rounded;
}

async function validDomains(
  projectId: string,
  value: unknown,
  exceptId: string | null,
): Promise<string[] | Fail> {
  if (!Array.isArray(value)) return fail('Invalid domains.', 'domains');
  const domains: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return fail('Invalid domains.', 'domains');
    const domain = normalizeDomain(raw);
    if (!domain) return fail(`“${raw.slice(0, 60)}” isn't a valid domain.`, 'domains');
    if (isPublicMailDomain(domain)) {
      return fail(`${domain} is a public email provider — use the company's own domain.`, 'domains');
    }
    if (!domains.includes(domain)) domains.push(domain);
  }
  if (domains.length > CUSTOMER_DOMAINS_MAX) {
    return fail(`At most ${CUSTOMER_DOMAINS_MAX} domains per customer.`, 'domains');
  }
  if (domains.length === 0) return domains;

  // Intake matching needs a domain to identify one customer.
  const [taken] = await db
    .select({ name: customers.name, domains: customers.domains })
    .from(customers)
    .where(
      and(
        eq(customers.projectId, projectId),
        arrayOverlaps(customers.domains, domains),
        exceptId ? ne(customers.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (taken) {
    const clash = domains.find((d) => taken.domains.includes(d));
    return fail(`${clash} already belongs to ${taken.name}.`, 'domains');
  }
  return domains;
}

async function isProjectMember(projectId: string, userId: string) {
  const [row] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** Validates the provided fields (absent = untouched). */
async function validateCustomerInput(
  projectId: string,
  input: CustomerInput,
  exceptId: string | null,
): Promise<CustomerChanges | Fail> {
  if (typeof input !== 'object' || input === null) return fail('Invalid input.');
  const changes: CustomerChanges = {};
  if (input.name !== undefined) {
    const value = validName(input.name);
    if (isFail(value)) return value;
    changes.name = value;
  }
  if (input.status !== undefined) {
    if (!isCustomerStatus(input.status)) return fail('Invalid status.', 'status');
    changes.status = input.status;
  }
  if (input.tier !== undefined) {
    if (input.tier !== null && typeof input.tier !== 'string') return fail('Invalid tier.', 'tier');
    const tier = input.tier?.trim() ?? '';
    if (tier.length > CUSTOMER_TIER_MAX) {
      return fail(`Tier must be ${CUSTOMER_TIER_MAX} characters or fewer.`, 'tier');
    }
    changes.tier = tier || null;
  }
  if (input.revenue !== undefined) {
    const value = validAmount(input.revenue, 'revenue', 'Revenue');
    if (isFail(value)) return value;
    changes.revenue = value;
  }
  if (input.size !== undefined) {
    const value = validAmount(input.size, 'size', 'Size');
    if (isFail(value)) return value;
    changes.size = value;
  }
  if (input.notes !== undefined) {
    if (input.notes !== null && typeof input.notes !== 'string') return fail('Invalid notes.', 'notes');
    if ((input.notes?.length ?? 0) > CUSTOMER_NOTES_MAX) {
      return fail(`Notes must be ${CUSTOMER_NOTES_MAX.toLocaleString('en')} characters or fewer.`, 'notes');
    }
    changes.notes = input.notes?.trim() ? input.notes : null;
  }
  if (input.ownerId !== undefined) {
    if (input.ownerId !== null && !isId(input.ownerId)) return fail('Invalid owner.', 'ownerId');
    if (input.ownerId && !(await isProjectMember(projectId, input.ownerId))) {
      return fail('The owner must be a member of this project.', 'ownerId');
    }
    changes.ownerId = input.ownerId;
  }
  if (input.domains !== undefined) {
    const value = await validDomains(projectId, input.domains, exceptId);
    if (isFail(value)) return value;
    changes.domains = value;
  }
  return changes;
}

async function loadCustomer(projectId: string, customerId: unknown) {
  if (!isId(customerId)) return null;
  const [row] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function createCustomer(
  input: { projectId: string } & CustomerInput,
): Promise<CustomerActionResult<{ id: string }>> {
  const gate = await authorizeProjectAction(input?.projectId, 'write');
  if (!gate.ok) return deny(gate.error);
  const projectId = input.projectId;

  const changes = await validateCustomerInput(projectId, { ...input, name: input.name ?? '' }, null);
  if (isFail(changes)) return changes;

  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(customers).values({
    id,
    projectId,
    name: changes.name!,
    domains: changes.domains ?? [],
    status: changes.status ?? 'active',
    tier: changes.tier ?? null,
    revenue: changes.revenue ?? null,
    size: changes.size ?? null,
    ownerId: changes.ownerId ?? null,
    notes: changes.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });
  revalidate(projectId);
  return { ok: true, id };
}

export async function updateCustomer(input: {
  projectId: string;
  id: string;
  patch: CustomerInput;
}): Promise<CustomerActionResult> {
  const gate = await authorizeProjectAction(input?.projectId, 'write');
  if (!gate.ok) return deny(gate.error);
  const customer = await loadCustomer(input.projectId, input.id);
  if (!customer) return fail('Customer not found.');

  const changes = await validateCustomerInput(input.projectId, input.patch, customer.id);
  if (isFail(changes)) return changes;
  if (Object.keys(changes).length === 0) return { ok: true };

  await db
    .update(customers)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(customers.id, customer.id), eq(customers.projectId, input.projectId)));
  revalidate(input.projectId);
  return { ok: true };
}

/** Admins only. Requests stay on their issues, unlinked (FK set null). */
export async function deleteCustomer(input: {
  projectId: string;
  id: string;
}): Promise<CustomerActionResult> {
  const gate = await authorizeProjectAction(input?.projectId, 'admin');
  if (!gate.ok) return deny(gate.error);
  const customer = await loadCustomer(input.projectId, input.id);
  if (!customer) return fail('Customer not found.');
  await db
    .delete(customers)
    .where(and(eq(customers.id, customer.id), eq(customers.projectId, input.projectId)));
  revalidate(input.projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Customer requests on an issue
// ---------------------------------------------------------------------------

async function loadTicket(projectId: string, ticketId: unknown) {
  if (!isId(ticketId)) return null;
  const [row] = await db
    .select({
      id: tickets.id,
      number: tickets.ticketNumber,
      title: tickets.title,
      ticketKey: projects.ticketKey,
    })
    .from(tickets)
    .innerJoin(projects, eq(tickets.projectId, projects.id))
    .where(and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)))
    .limit(1);
  return row ? { id: row.id, key: `${row.ticketKey}-${row.number}`, title: row.title } : null;
}

export async function getIssueCustomers(input: {
  projectId: string;
  ticketId: string;
}): Promise<CustomerActionResult<{ requests: IssueCustomerRequest[]; customers: CustomerOption[] }>> {
  const gate = await authorizeProjectAction(input?.projectId, 'read');
  if (!gate.ok) return deny(gate.error);
  const ticket = await loadTicket(input.projectId, input.ticketId);
  if (!ticket) return fail('Issue not found.');
  const [requests, options] = await Promise.all([
    getIssueCustomerRequests(input.projectId, ticket.id),
    getCustomerOptions(input.projectId),
  ]);
  return { ok: true, requests, customers: options };
}

export async function addCustomerRequest(input: {
  projectId: string;
  ticketId: string;
  /** An existing customer… */
  customerId?: string | null;
  /** …or a new one created by name. */
  newCustomerName?: string | null;
  importance?: Importance | null;
  body?: string;
}): Promise<CustomerActionResult<{ id: string; customerId: string }>> {
  const gate = await authorizeProjectAction(input?.projectId, 'write');
  if (!gate.ok) return deny(gate.error);
  const { projectId } = input;

  const ticket = await loadTicket(projectId, input.ticketId);
  if (!ticket) return fail('Issue not found.');
  if (input.importance != null && !isImportance(input.importance)) {
    return fail('Invalid importance.', 'importance');
  }
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (body.length > REQUEST_BODY_MAX) {
    return fail(`Keep the note under ${REQUEST_BODY_MAX.toLocaleString('en')} characters.`, 'body');
  }

  const now = new Date();
  let customer: { id: string; name: string } | null = null;
  if (input.customerId) {
    customer = await loadCustomer(projectId, input.customerId);
    if (!customer) return fail('Customer not found.', 'customerId');
  } else {
    const name = validName(input.newCustomerName);
    if (isFail(name)) return name;
    customer = { id: crypto.randomUUID(), name };
    await db.insert(customers).values({
      id: customer.id,
      projectId,
      name,
      createdAt: now,
      updatedAt: now,
    });
  }

  const id = crypto.randomUUID();
  await db.insert(customerRequests).values({
    id,
    projectId,
    ticketId: ticket.id,
    customerId: customer.id,
    importance: input.importance ?? null,
    source: 'manual',
    body,
    createdAt: now,
  });

  await emitIssueEvent({
    projectId,
    ticketId: ticket.id,
    actorId: gate.userId,
    type: 'customer.request_added',
    data: {
      key: ticket.key,
      title: ticket.title,
      summary: `added a customer request from ${customer.name}${
        input.importance ? ` (${IMPORTANCE_LABEL[input.importance].toLowerCase()} importance)` : ''
      }`,
      customerId: customer.id,
      customerName: customer.name,
      requestId: id,
    },
  });
  revalidate(projectId);
  return { ok: true, id, customerId: customer.id };
}

async function loadRequest(projectId: string, requestId: unknown) {
  if (!isId(requestId)) return null;
  const [row] = await db
    .select({
      id: customerRequests.id,
      ticketId: customerRequests.ticketId,
      source: customerRequests.source,
      customerName: customers.name,
    })
    .from(customerRequests)
    .leftJoin(customers, eq(customerRequests.customerId, customers.id))
    .where(and(eq(customerRequests.id, requestId), eq(customerRequests.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

/** Importance and/or the linked customer (e.g. an intake request from an unknown domain). */
export async function updateCustomerRequest(input: {
  projectId: string;
  id: string;
  importance?: Importance | null;
  customerId?: string | null;
}): Promise<CustomerActionResult> {
  const gate = await authorizeProjectAction(input?.projectId, 'write');
  if (!gate.ok) return deny(gate.error);
  const request = await loadRequest(input.projectId, input.id);
  if (!request) return fail('Request not found.');

  const changes: { importance?: Importance | null; customerId?: string | null } = {};
  if (input.importance !== undefined) {
    if (input.importance !== null && !isImportance(input.importance)) {
      return fail('Invalid importance.', 'importance');
    }
    changes.importance = input.importance;
  }
  if (input.customerId !== undefined) {
    if (input.customerId !== null) {
      const customer = await loadCustomer(input.projectId, input.customerId);
      if (!customer) return fail('Customer not found.', 'customerId');
    }
    changes.customerId = input.customerId;
  }
  if (Object.keys(changes).length === 0) return { ok: true };

  await db
    .update(customerRequests)
    .set(changes)
    .where(and(eq(customerRequests.id, request.id), eq(customerRequests.projectId, input.projectId)));
  revalidate(input.projectId);
  return { ok: true };
}

/**
 * Manual / API requests are deleted. Intake and Slack submissions are only
 * detached from the issue: the original submission stays on record.
 */
export async function removeCustomerRequest(input: {
  projectId: string;
  id: string;
}): Promise<CustomerActionResult> {
  const gate = await authorizeProjectAction(input?.projectId, 'write');
  if (!gate.ok) return deny(gate.error);
  const request = await loadRequest(input.projectId, input.id);
  if (!request) return fail('Request not found.');

  const scope = and(
    eq(customerRequests.id, request.id),
    eq(customerRequests.projectId, input.projectId),
  );
  if (request.source === 'intake' || request.source === 'slack') {
    await db.update(customerRequests).set({ ticketId: null }).where(scope);
  } else {
    await db.delete(customerRequests).where(scope);
  }

  const ticket = request.ticketId ? await loadTicket(input.projectId, request.ticketId) : null;
  if (ticket) {
    await emitIssueEvent({
      projectId: input.projectId,
      ticketId: ticket.id,
      actorId: gate.userId,
      type: 'customer.request_removed',
      data: {
        key: ticket.key,
        title: ticket.title,
        summary: request.customerName
          ? `removed a customer request from ${request.customerName}`
          : 'removed a customer request',
        requestId: request.id,
      },
    });
  }
  revalidate(input.projectId);
  return { ok: true };
}
