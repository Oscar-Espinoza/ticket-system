# D6 — Customer requests (issue section, intake matching, dashboard API)

## Goal
Attach "who asked for this" to issues: customer, importance, a note — and sum
the revenue behind each issue.

## UX
- **Issue section** `SectionCustomers` ("Customer requests"): header meta
  "$120K ARR across 3 customers" (distinct customers). Rows: customer name (link
  to its page) + revenue, importance chip, source glyph, excerpt (2 lines), hover
  remove. Requests without a customer (intake from an unknown domain) show the
  requester and a "Link customer" picker. Importance is editable per row.
- **Add** (+ in the header, or "Add customer request" when empty): popover step 1
  picks a customer (search; "Create customer “query”" creates one by name),
  step 2 importance (low/medium/high/critical, digits 1–4) + optional note,
  ⌘Enter adds. Optimistic list, resync from the server afterwards.
- **Intake**: `submitIntakeRequest` looks up the submitter's email domain
  (subdomains too: `eu.acme.com` → `acme.com`, most specific wins) against the
  project's customers and stores `customerId` + `source: 'intake'`. Intake
  settings explain the matching and link to Customers; the received-requests list
  shows the matched customer (integration request on the settings page — not
  owned).

## Data / actions
- `src/lib/customers.ts`: `getIssueCustomerRequests(projectId, ticketId)`,
  `matchCustomerByEmail(projectId, email)`, and
  **`customerRequestsForIssues(projectId, ticketIds)`** → `Map<ticketId,
  IssueCustomerRequest[]>` (no auth — callers authorize; used by D8 dashboards
  to chart issues by customer revenue).
- `src/app/actions/customers.ts`: `getIssueCustomers` (read: requests + customer
  options), `addCustomerRequest` (write; existing customer id or new name),
  `updateCustomerRequest` (write; importance, customerId), `removeCustomerRequest`
  (write). Ticket and customer ids validated against the project.
- Events: `customer.request_added` / `customer.request_removed` with
  `{key, title, summary, customerId, customerName}` → activity timeline.

## Edge cases
Remove: manual/api requests are deleted; intake/Slack submissions are only
detached from the issue (the submission record stays in the intake log and on
the customer). Note ≤ 4000 chars. A customer can have several requests on one
issue; revenue counts once. Guests see the section read-only; hidden when empty
and read-only.
