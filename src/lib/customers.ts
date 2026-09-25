// Customer reads (server-only). Page reads are authorized in SQL like epics:
// every query carries an EXISTS on the viewer's project membership, so a
// non-member reads nothing. The request helpers at the bottom trust their
// projectId — callers authorize first (server actions, D8 dashboards, intake).

import { cache } from 'react';
import { and, arrayOverlaps, desc, eq, exists, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import {
  customerRequests,
  customers,
  projectMembers,
  projects,
  tickets,
  users,
  workflowStates,
} from '@/db/schema';
import type { IssueRow, StateType } from '@/lib/issue-model';
import { queryIssues } from '@/lib/tickets';
import {
  isCustomerStatus,
  isImportance,
  toRequestSource,
  type CustomerListRow,
  type CustomerOption,
  type CustomerRequestView,
  type CustomerRow,
  type IssueCustomerRequest,
} from '@/components/customers/customer-model';

const ownerUsers = alias(users, 'customer_owner');

/** EXISTS: `userId` is a member of the project in `projectColumn`. */
function viewerIsMember(projectColumn: AnyPgColumn, userId: string): SQL {
  const viewer = alias(projectMembers, 'viewer');
  return exists(
    db
      .select({ one: sql`1` })
      .from(viewer)
      .where(and(eq(viewer.projectId, projectColumn), eq(viewer.userId, userId))),
  );
}

const customerColumns = {
  id: customers.id,
  name: customers.name,
  domains: customers.domains,
  status: customers.status,
  tier: customers.tier,
  revenue: customers.revenue,
  size: customers.size,
  notes: customers.notes,
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
  ownerId: ownerUsers.id,
  ownerName: ownerUsers.name,
  ownerImage: ownerUsers.image,
};

function selectCustomers(where: SQL | undefined) {
  return db
    .select(customerColumns)
    .from(customers)
    .leftJoin(ownerUsers, eq(customers.ownerId, ownerUsers.id))
    .where(where);
}

type CustomerSelect = Awaited<ReturnType<typeof selectCustomers>>[number];

function toCustomerRow(row: CustomerSelect): CustomerRow {
  return {
    id: row.id,
    name: row.name,
    domains: row.domains,
    status: isCustomerStatus(row.status) ? row.status : 'active',
    tier: row.tier,
    revenue: row.revenue,
    size: row.size,
    owner: row.ownerId ? { id: row.ownerId, name: row.ownerName ?? '', image: row.ownerImage } : null,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}


/** Open = linked, not trashed / archived, and not completed / canceled. */
const openIssueFilter = sql`${tickets.id} is not null and ${tickets.deletedAt} is null and ${tickets.archivedAt} is null and ${workflowStates.type} not in ('completed', 'canceled')`;

/** Every customer of the project with request / open-issue counts. [] for non-members. */
export async function getProjectCustomers(
  projectId: string,
  userId: string,
): Promise<CustomerListRow[]> {
  if (!projectId || !userId) return [];
  const [rows, stats] = await Promise.all([
    selectCustomers(
      and(eq(customers.projectId, projectId), viewerIsMember(customers.projectId, userId)),
    ).orderBy(customers.name),
    db
      .select({
        customerId: customerRequests.customerId,
        requests: sql<number>`count(*)::int`,
        open: sql<number>`(count(distinct ${tickets.id}) filter (where ${openIssueFilter}))::int`,
      })
      .from(customerRequests)
      .leftJoin(tickets, eq(customerRequests.ticketId, tickets.id))
      .leftJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
      .where(
        and(
          eq(customerRequests.projectId, projectId),
          isNotNull(customerRequests.customerId),
          viewerIsMember(customerRequests.projectId, userId),
        ),
      )
      .groupBy(customerRequests.customerId),
  ]);
  const byCustomer = new Map(stats.map((s) => [s.customerId, s]));
  return rows.map((row) => {
    const stat = byCustomer.get(row.id);
    return {
      ...toCustomerRow(row),
      requestCount: stat?.requests ?? 0,
      openIssueCount: stat?.open ?? 0,
    };
  });
}

/** Distinct tiers in use, for the tier filter / suggestions. */
export function customerTiers(rows: Pick<CustomerRow, 'tier'>[]): string[] {
  return [...new Set(rows.map((r) => r.tier).filter((t): t is string => Boolean(t)))].sort(
    (a, b) => a.localeCompare(b),
  );
}

export interface CustomerDetail {
  customer: CustomerRow;
  requests: CustomerRequestView[];
  /** Distinct linked issues (trash excluded), newest request first. */
  issues: IssueRow[];
}

/** One customer of the project, or null (unknown, foreign, or not a member). Memoized per request. */
export const getCustomerDetail = cache(async function getCustomerDetail(
  projectId: string,
  customerId: string,
  userId: string,
): Promise<CustomerDetail | null> {
  if (!projectId || !customerId || !userId) return null;
  const [[row], requestRows] = await Promise.all([
    selectCustomers(
      and(
        eq(customers.id, customerId),
        eq(customers.projectId, projectId),
        viewerIsMember(customers.projectId, userId),
      ),
    ).limit(1),
    db
      .select({
        id: customerRequests.id,
        importance: customerRequests.importance,
        source: customerRequests.source,
        name: customerRequests.name,
        email: customerRequests.email,
        body: customerRequests.body,
        createdAt: customerRequests.createdAt,
        ticketId: tickets.id,
        number: tickets.ticketNumber,
        title: tickets.title,
        archivedAt: tickets.archivedAt,
        deletedAt: tickets.deletedAt,
        stateName: workflowStates.name,
        stateType: workflowStates.type,
        stateColor: workflowStates.color,
        ticketKey: projects.ticketKey,
      })
      .from(customerRequests)
      .innerJoin(projects, eq(customerRequests.projectId, projects.id))
      .leftJoin(tickets, eq(customerRequests.ticketId, tickets.id))
      .leftJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
      .where(
        and(
          eq(customerRequests.customerId, customerId),
          eq(customerRequests.projectId, projectId),
          viewerIsMember(customerRequests.projectId, userId),
        ),
      )
      .orderBy(desc(customerRequests.createdAt)),
  ]);
  if (!row) return null;

  const requests: CustomerRequestView[] = requestRows.map((r) => ({
    id: r.id,
    importance: isImportance(r.importance) ? r.importance : null,
    source: toRequestSource(r.source),
    name: r.name,
    email: r.email,
    body: r.body,
    createdAt: r.createdAt,
    issue:
      r.ticketId && r.number !== null && !r.deletedAt
        ? {
            id: r.ticketId,
            key: `${r.ticketKey}-${r.number}`,
            title: r.title ?? '',
            stateType: (r.stateType ?? 'backlog') as StateType,
            stateColor: r.stateColor,
            stateName: r.stateName ?? '',
            archived: Boolean(r.archivedAt),
          }
        : null,
  }));

  const order = [...new Set(requests.flatMap((r) => (r.issue ? [r.issue.id] : [])))];
  const issueRows =
    order.length > 0
      ? await queryIssues(
          and(
            eq(tickets.projectId, projectId),
            inArray(tickets.id, order),
            isNull(tickets.deletedAt),
          ),
        )
      : [];
  const byId = new Map(issueRows.map((issue) => [issue.id, issue]));
  const issues = order.flatMap((id) => byId.get(id) ?? []);

  return { customer: toCustomerRow(row), requests, issues };
});

// ---------------------------------------------------------------------------
// Request helpers (trust projectId — authorize before calling)
// ---------------------------------------------------------------------------

/**
 * Customer requests of the given issues, grouped by ticket id (each list newest
 * first). Trusts `projectId` and filters ticket ids to it; exposed for D8's
 * dashboards ("issues by customer revenue") — sum `customer.revenue` over the
 * distinct customers of a ticket (see `revenueSummary` in customer-model).
 */
export async function customerRequestsForIssues(
  projectId: string,
  ticketIds: string[],
): Promise<Map<string, IssueCustomerRequest[]>> {
  const result = new Map<string, IssueCustomerRequest[]>();
  const ids = [...new Set(ticketIds.filter((id) => typeof id === 'string' && id))];
  if (!projectId || ids.length === 0) return result;

  const rows = await db
    .select({
      id: customerRequests.id,
      ticketId: customerRequests.ticketId,
      importance: customerRequests.importance,
      source: customerRequests.source,
      name: customerRequests.name,
      email: customerRequests.email,
      body: customerRequests.body,
      createdAt: customerRequests.createdAt,
      customerId: customers.id,
      customerName: customers.name,
      customerRevenue: customers.revenue,
      customerStatus: customers.status,
    })
    .from(customerRequests)
    .leftJoin(
      customers,
      and(eq(customerRequests.customerId, customers.id), eq(customers.projectId, projectId)),
    )
    .where(
      and(eq(customerRequests.projectId, projectId), inArray(customerRequests.ticketId, ids)),
    )
    .orderBy(desc(customerRequests.createdAt));

  for (const row of rows) {
    if (!row.ticketId) continue;
    const request: IssueCustomerRequest = {
      id: row.id,
      ticketId: row.ticketId,
      importance: isImportance(row.importance) ? row.importance : null,
      source: toRequestSource(row.source),
      name: row.name,
      email: row.email,
      body: row.body,
      createdAt: row.createdAt,
      customer: row.customerId
        ? {
            id: row.customerId,
            name: row.customerName ?? '',
            revenue: row.customerRevenue,
            status: isCustomerStatus(row.customerStatus) ? row.customerStatus : 'active',
          }
        : null,
    };
    const list = result.get(row.ticketId);
    if (list) list.push(request);
    else result.set(row.ticketId, [request]);
  }
  return result;
}

/** One issue's requests (newest first). Trusts projectId. */
export async function getIssueCustomerRequests(
  projectId: string,
  ticketId: string,
): Promise<IssueCustomerRequest[]> {
  return (await customerRequestsForIssues(projectId, [ticketId])).get(ticketId) ?? [];
}

/** Distinct tiers in use (tier filter / suggestions). Trusts projectId. */
export async function getCustomerTierOptions(projectId: string): Promise<string[]> {
  if (!projectId) return [];
  const rows = await db
    .selectDistinct({ tier: customers.tier })
    .from(customers)
    .where(and(eq(customers.projectId, projectId), isNotNull(customers.tier)));
  return customerTiers(rows);
}

/** Picker options, by name. Trusts projectId. */
export async function getCustomerOptions(projectId: string): Promise<CustomerOption[]> {
  if (!projectId) return [];
  return db
    .select({
      id: customers.id,
      name: customers.name,
      revenue: customers.revenue,
      domains: customers.domains,
    })
    .from(customers)
    .where(eq(customers.projectId, projectId))
    .orderBy(customers.name);
}

/** "eu.mail.acme.com" → ["eu.mail.acme.com", "mail.acme.com", "acme.com"]. */
function domainSuffixes(domain: string): string[] {
  const parts = domain.split('.');
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'));
  return out;
}

/**
 * The project customer whose domain matches the email's domain (or a parent
 * domain of it — the most specific match wins), or null. Trusts projectId.
 */
export async function matchCustomerByEmail(
  projectId: string,
  email: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  const domain = email?.split('@').pop()?.trim().toLowerCase().replace(/\.$/, '');
  if (!projectId || !domain || !email?.includes('@')) return null;
  const candidates = domainSuffixes(domain);
  if (candidates.length === 0) return null;

  const rows = await db
    .select({ id: customers.id, name: customers.name, domains: customers.domains })
    .from(customers)
    .where(
      and(
        eq(customers.projectId, projectId),
        arrayOverlaps(customers.domains, candidates),
      ),
    );

  let best: { id: string; name: string; length: number } | null = null;
  for (const row of rows) {
    for (const d of row.domains) {
      if (candidates.includes(d) && (!best || d.length > best.length)) {
        best = { id: row.id, name: row.name, length: d.length };
      }
    }
  }
  return best ? { id: best.id, name: best.name } : null;
}
