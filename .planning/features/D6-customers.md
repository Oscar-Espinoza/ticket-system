# D6 — Customer entities (list + detail)

## Goal
Track the companies a project builds for — revenue, size, tier, owner — and see
which issues they asked for, so prioritisation can weigh revenue.

## UX
- **Customers tab** (`/dashboard/projects/[id]/customers`): toolbar with search
  (name, domain, tier, owner), status toggle (All · Active · Lead · Churned, with
  counts, `?status=`), tier filter (tiers in use, `?tier=`), "New customer".
  Dense table: Name (+ first domain), Status, Tier, Revenue (compact `$120K`),
  Size, Owner, Requests, Open issues. Column headers sort (`?sort=name|revenue|
  size|requests|open`, `?dir=`); default revenue desc. j/k move focus, Enter
  opens. Row menu: Edit, Delete (admins; confirm). Palette: "New customer".
  Empty state explains customers + CTA; filtered-empty offers "Clear filters".
- **Create/edit dialog**: name, domains (comma/space separated), status, tier
  (free text with suggestions from existing tiers), annual revenue, size
  (employees), owner (member picker).
- **Customer page** (`/customers/[customerId]`): breadcrumb, name, status chip,
  ⋯ menu (Edit, Copy link, Delete). Main: Notes (markdown, edit in place via the
  shared `MarkdownEditor`), Requests timeline (newest first: source glyph,
  importance, requester, body, linked issue with state), Linked issues list
  (`IssueRefRow`, deduped). Sidebar: properties (status + owner inline pickers,
  the rest via Edit) and "Revenue impact" (ARR, open linked issues, requests).

## Data / actions
- `src/lib/customers.ts` (server, SQL-gated by viewer membership):
  `getProjectCustomers(projectId, userId)`, `getCustomerDetail(projectId,
  customerId, userId)`; plus request helpers (see D6-customer-requests.md).
- `src/app/actions/customers.ts`: `createCustomer` / `updateCustomer` (write),
  `deleteCustomer` (admin). Every write scoped by `(id, projectId)`; owner must be
  a project member; domains normalised (lower-case, no scheme / `www.` / path),
  validated, ≤ 10, unique within the project and not public mail providers
  (gmail.com …) so intake matching can't mis-attribute.
- Client model `src/components/customers/customer-model.ts` (statuses,
  importances, sources, labels, `formatRevenue`, `customerPath`).

## Files
`src/app/dashboard/projects/[id]/customers/{page,[customerId]/page}.tsx`,
`src/components/customers/*`, `src/lib/customers.ts`, `src/app/actions/customers.ts`.

## Edge cases
Unknown / foreign customer id → 404. Deleting a customer keeps its requests
(FK `set null`) — they stay on issues, unlinked. Guests read only. Revenue and
size are non-negative integers < 2³¹. Trashed issues are excluded from linked
issues and open counts; archived ones show struck through.
