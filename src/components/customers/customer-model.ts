// Customer domain model (client-safe): statuses, request importance / source,
// row shapes shared by the server reads and the UI, and formatting helpers.

import type { IssueUser, StateType } from '@/lib/issue-model';

export const CUSTOMER_STATUSES = ['active', 'lead', 'churned'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  active: 'Active',
  lead: 'Lead',
  churned: 'Churned',
};
export const isCustomerStatus = (value: unknown): value is CustomerStatus =>
  CUSTOMER_STATUSES.includes(value as CustomerStatus);

/** Highest first — the order pickers list them in. */
export const IMPORTANCES = ['critical', 'high', 'medium', 'low'] as const;
export type Importance = (typeof IMPORTANCES)[number];
export const IMPORTANCE_LABEL: Record<Importance, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
export const isImportance = (value: unknown): value is Importance =>
  IMPORTANCES.includes(value as Importance);

export const REQUEST_SOURCES = ['intake', 'slack', 'manual', 'api'] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];
export const REQUEST_SOURCE_LABEL: Record<RequestSource, string> = {
  intake: 'Intake form',
  slack: 'Slack',
  manual: 'Added manually',
  api: 'API',
};
export const toRequestSource = (value: string): RequestSource =>
  REQUEST_SOURCES.includes(value as RequestSource) ? (value as RequestSource) : 'manual';

export const CUSTOMER_NAME_MAX = 120;
export const CUSTOMER_TIER_MAX = 40;
export const CUSTOMER_NOTES_MAX = 20_000;
export const CUSTOMER_DOMAINS_MAX = 10;
export const REQUEST_BODY_MAX = 4000;
/** Postgres integer. */
export const INT_MAX = 2_147_483_647;

export interface CustomerRow {
  id: string;
  name: string;
  domains: string[];
  status: CustomerStatus;
  tier: string | null;
  /** Annual revenue, whole currency units. */
  revenue: number | null;
  /** Employees. */
  size: number | null;
  owner: IssueUser | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerListRow extends CustomerRow {
  requestCount: number;
  /** Distinct linked issues that are open (not completed / canceled / archived / trashed). */
  openIssueCount: number;
}

export interface LinkedIssueRef {
  id: string;
  key: string;
  title: string;
  stateType: StateType;
  stateColor: string | null;
  stateName: string;
  archived: boolean;
}

/** A request as the customer page shows it. */
export interface CustomerRequestView {
  id: string;
  importance: Importance | null;
  source: RequestSource;
  name: string | null;
  email: string | null;
  body: string;
  createdAt: Date;
  issue: LinkedIssueRef | null;
}

/** A request as an issue shows it. */
export interface IssueCustomerRequest {
  id: string;
  ticketId: string;
  importance: Importance | null;
  source: RequestSource;
  name: string | null;
  email: string | null;
  body: string;
  createdAt: Date;
  customer: { id: string; name: string; revenue: number | null; status: CustomerStatus } | null;
}

/** Picker option. */
export interface CustomerOption {
  id: string;
  name: string;
  revenue: number | null;
  domains: string[];
}

export const customersPath = (projectId: string) => `/dashboard/projects/${projectId}/customers`;
export const customerPath = (projectId: string, customerId: string) =>
  `${customersPath(projectId)}/${customerId}`;

const compact = new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** "$120K" (or the full amount with `full`). */
export function formatRevenue(value: number | null | undefined, full = false): string {
  if (value == null) return '';
  return (full ? whole : compact).format(value);
}

const count = new Intl.NumberFormat('en');
export const formatSize = (value: number | null | undefined) =>
  value == null ? '' : count.format(value);

/** Revenue behind a set of requests — each customer counted once. */
export function revenueSummary(requests: Pick<IssueCustomerRequest, 'customer'>[]) {
  const seen = new Map<string, number>();
  for (const request of requests) {
    if (request.customer) seen.set(request.customer.id, request.customer.revenue ?? 0);
  }
  let total = 0;
  for (const revenue of seen.values()) total += revenue;
  return { total, customers: seen.size };
}

// Public mail providers: a customer can't claim these, or every gmail
// submission would be attributed to one company.
const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'hey.com',
  'fastmail.com',
]);
export const isPublicMailDomain = (domain: string) => PUBLIC_MAIL_DOMAINS.has(domain);

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://www.Acme.com/pricing" → "acme.com"; null when it isn't a domain. */
export function normalizeDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.replace(/^[^@/]*@/, ''); // "someone@acme.com" pasted as a domain
  value = value.split(/[/?#:]/)[0] ?? '';
  value = value.replace(/^www\./, '').replace(/\.$/, '');
  return DOMAIN_RE.test(value) ? value : null;
}

/** Splits a free-text domain list ("acme.com, acme.io"). */
export const splitDomains = (value: string) =>
  value
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
