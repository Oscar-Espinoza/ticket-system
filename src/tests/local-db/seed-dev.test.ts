// Dev seed: fills a LOCAL Postgres with a realistic, deterministic data set so
// every page of the app has something to show (used to screenshot the old Next
// app and the new SvelteKit app side by side against the same data).
//
// It is written as a vitest file only so the '@/…' alias and the app's own
// modules resolve; it is NOT a test and is skipped unless explicitly enabled:
//
//   SEED_DEV=1 LOCAL_DB_TESTS=1 DATABASE_DRIVER=pg \
//   DATABASE_URL=postgres://postgres:postgres@localhost:5433/main \
//   npx vitest run src/tests/local-db/seed-dev.test.ts
//
// Safety: `localDb` (./guard) is only true when LOCAL_DB_TESTS=1 and every host
// the drivers could reach is this machine, so the live Neon URL in .env.local
// can never be seeded. Always pass DATABASE_URL explicitly (dotenv in
// src/tests/setup.ts never overrides a variable that is already set).
//
// Idempotency: every row has a deterministic id (a UUID derived from a stable
// name, see `sid`), so re-running finds the rows instead of duplicating them.
//   - rows written directly use INSERT … ON CONFLICT DO NOTHING on that id;
//   - issues go through the issue service with `opts.id` (its own replay path);
//   - things the services create with random ids (comments, link attachments,
//     relations, reactions) are looked up first and skipped when present;
//   - one-time follow-ups (state moves, archive/trash, back-dating, shaping the
//     inbox) only run for rows that are still "fresh" (see each helper).
// Dates are relative to "today" (overdue / current-cycle / upcoming stay
// meaningful), and are fixed the first time a row is created.
//
// Prefers the app's service functions so invariants hold (ticket counters,
// keys, activity rows, subscriptions, notification fan-out):
//   createIssue / updateIssueFields / archive / softDelete (issue-service),
//   createCommentAs / updateCommentAs (comments), createIssueRelation
//   (relations), addLinkAttachment (attachments), snapshotProject
//   (project-templates), firstRunFrom (recurring), auth.api.signUpEmail.
// Direct drizzle inserts are used where the app has no callable service (its
// writes live in server actions that need a request session): workspaces,
// projects, cycles, epics, initiatives, documents, views, customers,
// dashboards, templates, favorites, schedules, invitations, drafts, PR links.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';

// The app fans events out (notifications, Slack, webhooks) via next/server's
// `after()`, which only works inside a request. Here we run each background
// task ourselves and keep track of it, so the seed can wait until every inbox
// notification has been written before it finishes (see `drain`).
const pending = vi.hoisted(() => new Set<Promise<unknown>>());
vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: (task: unknown) => {
    const run: Promise<unknown> = Promise.resolve()
      .then(() => (typeof task === 'function' ? (task as () => unknown)() : task))
      .catch((err) => console.error('[seed] background task failed', err))
      .finally(() => pending.delete(run));
    pending.add(run);
  },
}));

import { db } from '@/lib/db';
import {
  activities,
  attachments,
  comments,
  commentReactions,
  customerRequests,
  customers,
  cycles,
  dashboards,
  documents,
  epicLabelLinks,
  epicLabels,
  epicRelations,
  epicUpdates,
  epics,
  favorites,
  githubPullRequests,
  initiatives,
  invitations,
  issueDrafts,
  issueLabels,
  issueRelations,
  issueTemplates,
  labels,
  milestones,
  notifications,
  projectMembers,
  projectTemplates,
  projects,
  recurringIssues,
  savedViews,
  sessions,
  tickets,
  userProfiles,
  users,
  workflowStates,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from '@/db/schema';
import { createIssue, updateIssueFields, archive, softDelete, SYSTEM_ACTOR } from '@/lib/issue-service';
import type { IssueRow, Priority } from '@/lib/issue-model';
import { createCommentAs, updateCommentAs } from '@/lib/comments';
import { createIssueRelation } from '@/lib/relations';
import { addLinkAttachment } from '@/lib/attachments';
import { formatMention } from '@/lib/mentions';
import { snapshotProject } from '@/lib/project-templates';
import { firstRunFrom } from '@/lib/recurring';
import { normalizeSchedule } from '@/lib/components/recurring/schedule';
import { normalizeIssueFilters } from '@/lib/issue-filtering';
import { DEFAULT_WORKFLOW_STATES } from '@/lib/workflow';
import { newWidget, normalizeWidgets, type Widget } from '@/lib/components/dashboards/widget-model';
import { localDb } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Stable UUID-shaped id for a name — the whole idempotency story hangs on this. */
const sid = (name: string) => {
  const h = createHash('sha1').update(`ticket-seed:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** YYYY-MM-DD, `offset` days from today (UTC) — for `date` columns. */
const isoDay = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
/** Midnight UTC, `offset` days from today. */
const utcMidnight = (offset: number) => {
  const d = new Date(Date.now() + offset * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const ago = (days: number) => new Date(Date.now() - days * DAY);

/** Lines → markdown. */
const md = (...lines: string[]) => lines.join('\n');
const FENCE = '```';

/** Wait for every after()-scheduled fan-out (notifications etc.) to finish. */
async function drain() {
  while (pending.size) await Promise.allSettled([...pending]);
}

const log = (msg: string) => console.log(`[seed] ${msg}`);

// ---------------------------------------------------------------------------
// Static content
// ---------------------------------------------------------------------------

const PASSWORD = 'Sup3r-secret-pass!';
const PEOPLE = [
  { key: 'alice', name: 'Alice Example', email: 'alice@acme.test', title: 'Engineering Lead', timezone: 'America/New_York' },
  { key: 'bob', name: 'Bob Builder', email: 'bob@acme.test', title: 'Backend Engineer', timezone: 'Europe/Berlin' },
  { key: 'carol', name: 'Carol Chen', email: 'carol@acme.test', title: 'Product Designer', timezone: 'Asia/Singapore' },
] as const;
type U = (typeof PEOPLE)[number]['key'];

type StateName = (typeof DEFAULT_WORKFLOW_STATES)[number]['name'];

const EPIC_COLORS = { E1: '#5e6ad2', E2: '#f2994a', E3: '#4cb782' };

const DESC_PAYMENT = md(
  '## Problem',
  '',
  'Customers who mistype a card number currently see a generic **"Something went wrong"** banner and have no idea which field is wrong. Support gets ~15 tickets a week about it.',
  '',
  '### Expected behaviour',
  '',
  '- Inline error directly under the offending field',
  '- Copy comes from our friendly error map, never the raw Stripe message',
  '- Focus moves to the first invalid field on submit',
  '',
  '### Acceptance criteria',
  '',
  '- [x] Luhn check on the client',
  '- [x] Expired cards are rejected before hitting the API',
  '- [ ] Map Stripe `decline_code` values to friendly copy',
  '- [ ] Playwright coverage for the three failure paths',
  '',
  '### Error mapping',
  '',
  '| Stripe code | Message shown | Retryable |',
  '| --- | --- | --- |',
  '| `card_declined` | Your card was declined. Try another card. | No |',
  '| `expired_card` | Your card has expired. | No |',
  '| `processing_error` | We could not process the payment. Please retry. | Yes |',
  '',
  '### Sketch',
  '',
  `${FENCE}ts`,
  'export function messageFor(code: string): string {',
  "  return ERROR_COPY[code] ?? 'Your payment could not be completed.';",
  '}',
  FENCE,
);

const DESC_SEARCH = md(
  '## Symptoms',
  '',
  'Search on `/products?q=` has a **p95 of 2.4s** since the catalog import on Monday (it was 180ms).',
  '',
  '## What we know',
  '',
  '1. The slow query is the `ILIKE` on `products.title`',
  '2. Only affects queries with more than two words',
  '3. CPU on the primary is fine, so this is a plan problem',
  '',
  `${FENCE}sql`,
  "EXPLAIN ANALYZE SELECT * FROM products WHERE title ILIKE '%blue running shoes%' LIMIT 24;",
  '-- Seq Scan on products  (cost=0.00..48211.00 rows=12 width=312) (actual time=2310.2..2310.4 rows=12 loops=1)',
  FENCE,
  '',
  '| Query | Before | Now |',
  '| --- | --- | --- |',
  '| single word | 180 ms | 190 ms |',
  '| three words | 190 ms | 2400 ms |',
);

const DESC_DESIGN = md(
  '## Goals',
  '',
  'Reduce checkout from **five steps to three** without losing the order summary.',
  '',
  '## Deliverables',
  '',
  '- Desktop + mobile frames in Figma',
  '- Empty / error / loading states for every step',
  '- Handoff notes for engineering',
  '',
  '> Keep the visual language aligned with the new design system tokens.',
);

const DESC_ORDER = md(
  '## Scope',
  '',
  '- [x] Order number + summary',
  '- [x] Email receipt CTA',
  '- [ ] Estimated delivery date',
  '- [ ] "Create account" prompt for guests',
);

const DESC_LEAK = md(
  'Heap grows by ~40 MB per hour on the `image-resizer` worker until it is OOM-killed.',
  '',
  'Suspect: we create a new `sharp` instance per job and never release the pipeline.',
  '',
  `${FENCE}js`,
  'const out = await sharp(buf).resize(800).toBuffer();',
  '// TODO: reuse a single instance / call .destroy()',
  FENCE,
);

const DESC_API = md(
  '# Public API v2',
  '',
  '## Why',
  'v1 has no pagination contract, inconsistent error shapes and no webhooks.',
  '',
  '## Proposed resources',
  '',
  '- `/v2/issues`',
  '- `/v2/projects`',
  '- `/v2/webhooks`',
  '',
  '## Open questions',
  '',
  '- [ ] Cursor vs offset pagination',
  '- [ ] Versioning in header or path',
);

const intakeBody = (who: string, text: string) =>
  md(text, '', '---', `_Submitted through the intake form by ${who}._`);

// ---------------------------------------------------------------------------
// Issue specs
// ---------------------------------------------------------------------------

interface IssueSpec {
  /** Stable slug (part of the deterministic id). */
  k: string;
  t: string;
  /** State the issue is CREATED in; `moves` then walk it forward. */
  st: StateName;
  pr?: Priority;
  /** Assignee (null / omitted = unassigned). */
  as?: U | null;
  /** Creator; 'system' = intake form (no user). Default alice. */
  by?: U | 'system';
  lb?: string[];
  es?: number;
  /** Days from today (negative = overdue). */
  due?: number;
  start?: number;
  cy?: 'past' | 'cur' | 'next';
  ep?: 'E1' | 'E2' | 'E3';
  ms?: 'design' | 'beta';
  parent?: string;
  d?: string;
  /** Days ago it was created (the issue is back-dated to this on first seed). */
  age: number;
  /** Days from creation until completed/canceled (when the final state is closed). */
  closeAfter?: number;
  /** State changes made after creation, through the service (builds activity + inbox). */
  moves?: [StateName, U][];
  life?: 'archived' | 'trashed';
}

const WEB_ISSUES: IssueSpec[] = [
  // --- Past cycle (1): completed work ------------------------------------
  { k: 'ci', t: 'Set up CI pipeline for the web app', st: 'Todo', moves: [['In Progress', 'bob'], ['Done', 'bob']], pr: 'high', as: 'bob', lb: ['infra'], es: 3, cy: 'past', ep: 'E2', age: 40, closeAfter: 5 },
  { k: 'mockups', t: 'Design new checkout flow mockups', st: 'Todo', moves: [['In Progress', 'carol'], ['Done', 'carol']], pr: 'high', as: 'carol', lb: ['design'], es: 5, cy: 'past', ep: 'E1', ms: 'design', d: DESC_DESIGN, age: 38, closeAfter: 6 },
  { k: 'rounding', t: 'Fix cart total rounding error', st: 'Done', pr: 'urgent', as: 'bob', lb: ['bug'], es: 2, cy: 'past', ep: 'E1', age: 36, closeAfter: 1.5 },
  { k: 'stripe-retry', t: 'Add Stripe webhook retries with backoff', st: 'Done', pr: 'medium', as: 'alice', by: 'bob', lb: ['feature'], es: 5, cy: 'past', ep: 'E1', age: 35, closeAfter: 5 },
  { k: 'jquery', t: 'Remove legacy jQuery from the landing page', st: 'Canceled', pr: 'none', as: 'carol', cy: 'past', age: 34, closeAfter: 4 },
  { k: 'dup-total', t: 'Cart shows wrong total after applying coupon', st: 'Duplicate', pr: 'low', as: 'bob', by: 'carol', lb: ['bug'], cy: 'past', age: 30, closeAfter: 1 },
  { k: 'contrast', t: 'Audit color contrast on forms', st: 'Done', pr: 'medium', as: 'carol', lb: ['design'], es: 3, cy: 'past', ep: 'E3', age: 33, closeAfter: 4 },
  { k: 'modal-kbd', t: 'Keyboard navigation for modal dialogs', st: 'Done', pr: 'high', as: 'carol', lb: ['bug'], es: 3, cy: 'past', ep: 'E3', age: 32, closeAfter: 4 },
  { k: 'aria', t: 'Screen reader labels for icon buttons', st: 'Done', pr: 'medium', as: 'bob', lb: ['feature'], es: 2, cy: 'past', ep: 'E3', age: 31, closeAfter: 3 },
  { k: 'skip-link', t: 'Add skip-to-content link', st: 'Done', pr: 'low', as: 'alice', by: 'carol', lb: ['design'], es: 1, cy: 'past', ep: 'E3', age: 30, closeAfter: 2 },

  // --- Current cycle (2) -------------------------------------------------
  { k: 'pay-validate', t: 'Payment form validation errors', st: 'Todo', moves: [['In Progress', 'alice']], pr: 'urgent', as: 'alice', lb: ['bug'], es: 3, due: 2, start: -3, cy: 'cur', ep: 'E1', ms: 'beta', d: DESC_PAYMENT, age: 2.5 },
  { k: 'order-confirm', t: 'Order confirmation page', st: 'Todo', moves: [['In Progress', 'carol'], ['In Review', 'carol']], pr: 'high', as: 'carol', lb: ['feature'], es: 5, due: 3, start: -5, cy: 'cur', ep: 'E1', ms: 'beta', d: DESC_ORDER, age: 6 },
  { k: 'address-auto', t: 'Address autocomplete in checkout', st: 'Todo', pr: 'medium', as: 'bob', lb: ['feature'], es: 5, due: 9, cy: 'cur', ep: 'E1', ms: 'beta', age: 5 },
  { k: 'guest-checkout', t: 'Guest checkout', st: 'In Progress', pr: 'high', as: 'bob', lb: ['feature'], es: 8, due: 5, start: -6, cy: 'cur', ep: 'E1', ms: 'beta', age: 9 },
  { k: 'apple-pay', t: 'Apple Pay button', st: 'Todo', pr: 'medium', as: 'carol', by: 'bob', lb: ['feature'], es: 3, cy: 'cur', ep: 'E1', ms: 'beta', age: 4 },
  { k: 'slow-search', t: 'Slow product search query (p95 > 2s)', st: 'In Progress', pr: 'urgent', as: 'bob', by: 'carol', lb: ['bug', 'infra'], es: 5, due: -2, start: -8, cy: 'cur', ep: 'E2', d: DESC_SEARCH, age: 3 },
  { k: 'orders-index', t: 'Add database index for orders by user', st: 'In Review', pr: 'high', as: 'alice', by: 'bob', lb: ['infra'], es: 2, due: -1, cy: 'cur', ep: 'E2', age: 6.5 },
  { k: 'edge-cache', t: 'Cache the product catalog at the edge', st: 'Todo', pr: 'medium', as: 'bob', lb: ['infra'], es: 8, cy: 'cur', ep: 'E2', age: 5 },
  { k: 'mem-leak', t: 'Memory leak in image resizer worker', st: 'In Progress', pr: 'high', as: 'carol', by: 'bob', lb: ['bug'], es: 5, due: 1, cy: 'cur', ep: 'E2', d: DESC_LEAK, age: 4 },
  { k: 'error-budget', t: 'Error budget dashboard', st: 'Todo', pr: 'medium', as: 'alice', by: 'carol', lb: ['infra'], es: 3, cy: 'cur', ep: 'E2', age: 6 },
  { k: 'flaky', t: 'Fix flaky e2e test: checkout.spec', st: 'Done', pr: 'medium', as: 'bob', lb: ['bug'], es: 2, cy: 'cur', ep: 'E2', age: 8, closeAfter: 3 },
  { k: 'deps', t: 'Update dependencies (monthly)', st: 'Done', pr: 'low', as: 'alice', lb: ['infra'], es: 1, cy: 'cur', age: 9, closeAfter: 2 },

  // --- Sub-issues --------------------------------------------------------
  { k: 'inline-err', t: 'Show inline error on card number field', st: 'In Progress', pr: 'medium', as: 'alice', lb: ['bug'], es: 1, parent: 'pay-validate', cy: 'cur', age: 2 },
  { k: 'stripe-map', t: 'Map Stripe decline codes to friendly messages', st: 'Todo', pr: 'medium', as: 'bob', lb: ['bug'], es: 2, parent: 'pay-validate', cy: 'cur', age: 2 },
  { k: 'validator-tests', t: 'Unit tests for card validators', st: 'Done', pr: 'low', as: 'carol', es: 2, parent: 'pay-validate', cy: 'cur', age: 2, closeAfter: 1 },
  { k: 'explain', t: 'Profile EXPLAIN plan for the search query', st: 'Done', pr: 'medium', as: 'bob', lb: ['infra'], es: 1, parent: 'slow-search', cy: 'cur', age: 3, closeAfter: 1 },
  { k: 'trigram', t: 'Add trigram index on product title', st: 'Todo', pr: 'high', as: 'bob', lb: ['infra'], es: 3, parent: 'slow-search', cy: 'cur', age: 3 },

  // --- Upcoming cycle (3) ------------------------------------------------
  { k: 'saved-pay', t: 'Saved payment methods', st: 'Todo', pr: 'medium', as: 'alice', by: 'bob', lb: ['feature'], es: 8, cy: 'next', ep: 'E1', age: 3 },
  { k: 'order-filters', t: 'Order history filters', st: 'Todo', pr: 'low', as: 'carol', lb: ['feature'], es: 3, cy: 'next', age: 3 },
  { k: 'dark-admin', t: 'Dark mode for the admin dashboard', st: 'Backlog', pr: 'low', as: 'carol', lb: ['design'], es: 5, cy: 'next', age: 12 },
  { k: 'rate-limit', t: 'Rate limit public endpoints', st: 'Todo', pr: 'high', as: 'bob', lb: ['infra'], es: 5, cy: 'next', ep: 'E2', age: 4 },

  // --- Backlog (no cycle) ------------------------------------------------
  { k: 'api-v2', t: 'Public API v2: draft spec', st: 'Backlog', pr: 'medium', as: 'alice', by: 'bob', lb: ['feature'], due: 40, d: DESC_API, age: 20 },
  { k: 'webhook-sign', t: 'Webhook signing for API v2', st: 'Backlog', pr: 'low', as: null, lb: ['feature'], age: 18 },
  { k: 'e2e-tool', t: 'Evaluate Playwright vs Cypress', st: 'Backlog', pr: 'none', as: null, lb: ['infra'], age: 15 },
  { k: 'hero-jank', t: 'Marketing hero animation janks on low-end Android', st: 'Backlog', pr: 'low', as: 'carol', by: 'bob', lb: ['bug', 'design'], age: 14 },
  { k: 'i18n', t: 'Add i18n support (es, fr)', st: 'Backlog', pr: 'medium', as: null, lb: ['feature'], es: 8, age: 25 },
  { k: 'avif', t: 'Migrate product images to AVIF', st: 'Backlog', pr: 'low', as: 'bob', lb: ['infra'], es: 3, age: 11 },

  // --- Triage (two from the public intake form, one reported by a member) --
  { k: 'safari-login', t: 'Login button does nothing on Safari 16', st: 'Triage', pr: 'none', by: 'system', d: intakeBody('Jane Doe (jane@globex.com)', "Clicking **Log in** does nothing for me on Safari 16.4 / macOS. Works in Chrome."), age: 1 },
  { k: 'csv-export', t: 'Feature request: export orders as CSV', st: 'Triage', pr: 'none', by: 'system', d: intakeBody('Priya N (priya@initech.io)', 'We need to export our order history as CSV for accounting.'), age: 0.7 },
  { k: 'xss', t: 'Possible XSS in the product review field', st: 'Triage', pr: 'urgent', by: 'carol', lb: ['bug'], d: 'Reviews render `<img onerror=…>` unescaped in the admin moderation view. Needs a look today.', age: 0.6 },

  // --- Archived + trash --------------------------------------------------
  { k: 'promo-banner', t: 'Update holiday promo banner copy', st: 'Done', pr: 'low', as: 'carol', lb: ['design'], es: 1, age: 120, closeAfter: 3, life: 'archived' },
  { k: 'graphql-spike', t: 'Spike: GraphQL gateway', st: 'Canceled', pr: 'medium', as: 'bob', by: 'bob', lb: ['infra'], age: 90, closeAfter: 10, life: 'archived' },
  { k: 'junk', t: 'Test issue please ignore', st: 'Backlog', pr: 'none', by: 'carol', age: 20, life: 'trashed' },
];

const OPS_ISSUES: IssueSpec[] = [
  { k: 'rotate-creds', t: 'Rotate database credentials', st: 'Todo', pr: 'high', as: 'alice', lb: ['infra'], due: 6, age: 5 },
  { k: 'grafana', t: 'Set up Grafana alerts for p95 latency', st: 'In Progress', pr: 'medium', as: 'bob', lb: ['infra'], age: 7 },
  { k: 'postmortem', t: 'Postmortem: Oct 28 checkout outage', st: 'Todo', moves: [['In Progress', 'alice'], ['Done', 'alice']], pr: 'urgent', as: 'alice', lb: ['incident'], d: md('## Timeline', '', '- 14:02 alerts fire', '- 14:10 rollback started', '- 14:31 recovered', '', '## Action items', '', '- [x] Add canary deploys', '- [ ] Rehearse rollback quarterly'), age: 14, closeAfter: 6 },
  { k: 'pg16', t: 'Upgrade Postgres 15 to 16', st: 'Backlog', pr: 'medium', as: 'bob', lb: ['infra'], age: 22 },
  { k: 'restore-drill', t: 'Backup restore drill', st: 'Todo', pr: 'high', as: 'bob', by: 'alice', lb: ['infra'], due: 14, age: 3 },
  { k: 'tf-lock', t: 'Terraform state locking', st: 'In Review', pr: 'medium', as: 'alice', by: 'bob', lb: ['infra'], age: 4 },
  { k: 'cdn-costs', t: 'Reduce CloudFront costs', st: 'Backlog', pr: 'low', as: null, lb: ['infra'], age: 30 },
  { k: 'pager', t: 'Pager rotation for December', st: 'Todo', pr: 'low', as: 'alice', by: 'bob', due: 20, age: 2 },
];

interface CommentSpec {
  key: string;
  on: string;
  by: U;
  body: string;
  /** Edit the comment to this text after creating it (shows the "edited" tag). */
  edit?: string;
  replyTo?: string;
  reactions?: [string, U][];
}

// `@name` tokens are expanded to the app's mention syntax by `mention()`.
const COMMENTS: CommentSpec[] = [
  { key: 'c1', on: 'pay-validate', by: 'bob', body: 'Do we show Stripe\'s own error text or map it ourselves? cc @alice' },
  { key: 'c2', on: 'pay-validate', by: 'alice', replyTo: 'c1', body: 'Mapping it. The copy lives in `lib/copy.ts`, PR coming today.' },
  { key: 'c3', on: 'pay-validate', by: 'carol', replyTo: 'c1', body: 'Final copy is in the checkout spec doc, section **Errors**.', reactions: [['👍', 'bob'], ['🎉', 'alice']] },
  { key: 'c4', on: 'slow-search', by: 'carol', body: '@bob can you look at the EXPLAIN? FYI @alice this is blocking the Black Friday campaign.' },
  { key: 'c5', on: 'slow-search', by: 'bob', body: 'Seq scan on products, adding an index.', edit: 'Seq scan on `products.title` - a trigram index should fix it. Sub-issues added.' },
  { key: 'c6', on: 'order-confirm', by: 'alice', body: 'Looks great! Can we add the estimated delivery date?' },
  { key: 'c7', on: 'order-confirm', by: 'carol', replyTo: 'c6', body: 'Yes, already added to the mock.', reactions: [['🚀', 'alice']] },
  { key: 'c8', on: 'guest-checkout', by: 'bob', body: 'Blocked on address autocomplete for the shipping step.' },
  { key: 'c9', on: 'mem-leak', by: 'bob', body: md('@carol reproduced locally, it is the `sharp` instances:', '', `${FENCE}bash`, 'node --inspect worker.js  # heap snapshot after 200 jobs', FENCE) },
  { key: 'c10', on: 'ci', by: 'alice', body: 'CI is green on `main` now.', reactions: [['🎉', 'bob'], ['🎉', 'carol']] },
  { key: 'c11', on: 'api-v2', by: 'bob', body: 'Draft is in the docs tab. @alice please review before Friday.' },
  { key: 'c12', on: 'safari-login', by: 'carol', body: 'Cannot reproduce on Safari 17. Does anyone have a Safari 16 device?' },
  { key: 'c13', on: 'stripe-retry', by: 'bob', body: 'Retries capped at 5 with exponential backoff.', reactions: [['🚀', 'alice']] },
  { key: 'c14', on: 'xss', by: 'bob', body: 'Reproduced on staging. @alice @carol this needs a fix today.' },
];

const LINKS: { on: string; url: string; title: string }[] = [
  { on: 'pay-validate', url: 'https://www.figma.com/file/acme-checkout/Checkout-v2', title: 'Figma: Checkout v2' },
  { on: 'pay-validate', url: 'https://docs.stripe.com/declines/codes', title: 'Stripe decline codes' },
  { on: 'slow-search', url: 'https://metrics.acme.test/d/search-latency', title: 'Search latency dashboard' },
  { on: 'rounding', url: 'https://github.com/acme/web/pull/412', title: 'PR #412: fix rounding' },
  { on: 'api-v2', url: 'https://notion.acme.test/api-v2-rfc', title: 'API v2 RFC' },
];

const RELATIONS: { from: string; to: string; kind: 'blocks' | 'related' | 'duplicate_of'; by: U }[] = [
  { from: 'pay-validate', to: 'apple-pay', kind: 'blocks', by: 'alice' },
  { from: 'orders-index', to: 'slow-search', kind: 'blocks', by: 'bob' },
  { from: 'slow-search', to: 'edge-cache', kind: 'related', by: 'bob' },
  { from: 'address-auto', to: 'saved-pay', kind: 'related', by: 'alice' },
  { from: 'guest-checkout', to: 'order-confirm', kind: 'related', by: 'carol' },
  { from: 'dup-total', to: 'rounding', kind: 'duplicate_of', by: 'carol' },
];

// ---------------------------------------------------------------------------
// The seed
// ---------------------------------------------------------------------------

describe.skipIf(process.env.SEED_DEV !== '1' || !localDb)('dev seed', () => {
  it(
    'fills the local database with the Acme demo workspace',
    async () => {
      const now = new Date();

      // ---- 1. Users (through Better Auth so the passwords really work) ------
      const { auth } = await import('@/lib/auth');
      const uid = {} as Record<U, string>;
      const signedUp: string[] = [];
      for (const p of PEOPLE) {
        let [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, p.email)).limit(1);
        if (!row) {
          const res = await auth.api.signUpEmail({
            body: { name: p.name, email: p.email, password: PASSWORD },
            asResponse: true,
          });
          if (!res.ok) throw new Error(`sign-up failed for ${p.email}: ${res.status} ${await res.text()}`);
          [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, p.email)).limit(1);
          signedUp.push(row.id);
        }
        uid[p.key] = row.id;
      }
      const userIds = Object.values(uid);
      // Sign-up opens a session per new user; the seed does not want those rows.
      // (Only for users created just now: a re-run must not log anyone out.)
      if (signedUp.length) await db.delete(sessions).where(inArray(sessions.userId, signedUp));
      await db.update(users).set({ emailVerified: true }).where(inArray(users.id, userIds));
      await db
        .insert(userProfiles)
        .values(
          PEOPLE.map((p) => ({
            userId: uid[p.key],
            title: p.title,
            timezone: p.timezone,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflictDoNothing();
      const person = (key: U) => ({ id: uid[key], name: PEOPLE.find((p) => p.key === key)!.name });
      const mention = (text: string) =>
        text.replace(/@(alice|bob|carol)\b/g, (_, key: U) => formatMention(person(key)));
      log('users ready');

      // ---- 2. Workspace + projects + workflow + labels ----------------------
      const WS = sid('workspace:acme');
      await db
        .insert(workspaces)
        .values({ id: WS, name: 'Acme', slug: 'acme', ownerId: uid.alice, createdAt: now, updatedAt: now })
        .onConflictDoNothing();
      await db
        .insert(workspaceMembers)
        .values(
          (['alice', 'bob', 'carol'] as const).map((u) => ({
            id: sid(`wsm:${u}`),
            workspaceId: WS,
            userId: uid[u],
            role: u === 'alice' ? ('owner' as const) : u === 'bob' ? ('admin' as const) : ('member' as const),
            createdAt: now,
          })),
        )
        .onConflictDoNothing();

      const WEB = sid('project:web');
      const OPS = sid('project:ops');
      await db
        .insert(projects)
        .values([
          {
            id: WEB,
            name: 'Web',
            ticketKey: 'WEB',
            ownerId: uid.alice,
            description: 'The customer-facing storefront and checkout.',
            color: '#5e6ad2',
            workspaceId: WS,
            visibility: 'workspace',
            cyclesEnabled: true,
            cycleDurationWeeks: 2,
            cycleStartWeekday: 1,
            // SLA hours per priority and fibonacci estimates: set BEFORE issues
            // exist so the issue service computes slaDueAt / validates estimates.
            slaPolicy: { urgent: 48, high: 168, medium: 336, low: 720 },
            estimateScale: 'fibonacci',
            triageEnabled: true,
            intakeToken: `seedintake${sid('intake:web').replace(/-/g, '')}`.slice(0, 40),
            createdAt: ago(45),
            updatedAt: now,
          },
          {
            id: OPS,
            name: 'Ops',
            ticketKey: 'OPS',
            ownerId: uid.alice,
            description: 'Infrastructure, on-call and incident follow-ups.',
            color: '#26b5ce',
            workspaceId: WS,
            visibility: 'private',
            createdAt: ago(30),
            updatedAt: now,
          },
        ])
        .onConflictDoNothing();
      await db
        .insert(projectMembers)
        .values([
          { id: sid('pm:web:alice'), projectId: WEB, userId: uid.alice, role: 'owner', createdAt: now },
          { id: sid('pm:web:bob'), projectId: WEB, userId: uid.bob, role: 'admin', createdAt: now },
          { id: sid('pm:web:carol'), projectId: WEB, userId: uid.carol, role: 'member', createdAt: now },
          { id: sid('pm:ops:alice'), projectId: OPS, userId: uid.alice, role: 'owner', createdAt: now },
          { id: sid('pm:ops:bob'), projectId: OPS, userId: uid.bob, role: 'member', createdAt: now },
        ])
        .onConflictDoNothing();

      // Same default workflow the app seeds for new projects, with stable ids.
      const stateId = (project: 'web' | 'ops', name: string) => sid(`${project}:state:${name}`);
      await db
        .insert(workflowStates)
        .values(
          (['web', 'ops'] as const).flatMap((p) =>
            DEFAULT_WORKFLOW_STATES.map((s) => ({
              id: stateId(p, s.name),
              projectId: p === 'web' ? WEB : OPS,
              name: s.name,
              type: s.type,
              color: s.color,
              position: s.position,
              createdAt: now,
            })),
          ),
        )
        .onConflictDoNothing();

      const WEB_LABELS = [
        ['bug', '#eb5757', 'Something is broken'],
        ['feature', '#4cb782', 'New functionality'],
        ['design', '#bb87fc', 'Needs design work'],
        ['infra', '#26b5ce', 'Infrastructure and tooling'],
      ] as const;
      const OPS_LABELS = [
        ['infra', '#26b5ce', 'Infrastructure and tooling'],
        ['incident', '#f2994a', 'Production incident follow-up'],
      ] as const;
      const labelId = (project: 'web' | 'ops', name: string) => sid(`${project}:label:${name}`);
      await db
        .insert(labels)
        .values([
          ...WEB_LABELS.map(([name, color, description]) => ({ id: labelId('web', name), projectId: WEB, name, color, description, createdAt: now })),
          ...OPS_LABELS.map(([name, color, description]) => ({ id: labelId('ops', name), projectId: OPS, name, color, description, createdAt: now })),
        ])
        .onConflictDoNothing();
      log('workspace, projects, workflow and labels ready');

      // ---- 3. Cycles (past completed / current / upcoming) ------------------
      // Two-week cycles on Mondays, laid out so "today" is inside the current one.
      const dow = (new Date().getUTCDay() + 6) % 7; // days since Monday
      const monday = -dow;
      const cycleSpecs = [
        { key: 'past', number: 1, name: 'Checkout foundations', from: monday - 21, to: monday - 7, done: true, description: 'Stabilise payments and kick off the accessibility pass.' },
        { key: 'cur', number: 2, name: 'Checkout beta', from: monday - 7, to: monday + 7, done: false, description: 'Ship guest checkout and the new confirmation page.' },
        { key: 'next', number: 3, name: 'Search and scale', from: monday + 7, to: monday + 21, done: false, description: 'Performance work and rate limiting.' },
      ] as const;
      await db
        .insert(cycles)
        .values(
          cycleSpecs.map((c) => ({
            id: sid(`web:cycle:${c.key}`),
            projectId: WEB,
            number: c.number,
            name: c.name,
            description: c.description,
            startsAt: utcMidnight(c.from),
            endsAt: utcMidnight(c.to),
            completedAt: c.done ? utcMidnight(c.to) : null,
            createdAt: ago(50),
          })),
        )
        .onConflictDoNothing();
      const cycleId = (k: 'past' | 'cur' | 'next') => sid(`web:cycle:${k}`);

      // ---- 4. Initiative, epics, milestones, epic updates/labels/relations --
      const INIT = sid('initiative:q4-growth');
      await db
        .insert(initiatives)
        .values({
          id: INIT,
          workspaceId: WS,
          ownerId: uid.alice,
          name: 'Q4 Growth',
          description: 'Convert more visitors and keep the storefront fast under holiday load.',
          status: 'active',
          targetDate: isoDay(60),
          createdAt: ago(40),
          updatedAt: now,
        })
        .onConflictDoNothing();

      const epicId = (k: 'E1' | 'E2' | 'E3') => sid(`web:epic:${k}`);
      await db
        .insert(epics)
        .values([
          { id: epicId('E1'), projectId: WEB, name: 'Checkout redesign', description: 'A shorter, clearer checkout with guest purchase and wallet payments.', color: EPIC_COLORS.E1, status: 'started', health: 'on_track', leadId: uid.carol, startDate: isoDay(-30), targetDate: isoDay(21), initiativeId: INIT, sortOrder: 1, createdAt: ago(40), updatedAt: now },
          { id: epicId('E2'), projectId: WEB, name: 'Performance and reliability', description: 'Make the storefront fast and boring under load.', color: EPIC_COLORS.E2, status: 'started', health: 'at_risk', leadId: uid.bob, startDate: isoDay(-28), targetDate: isoDay(10), initiativeId: INIT, sortOrder: 2, createdAt: ago(40), updatedAt: now },
          { id: epicId('E3'), projectId: WEB, name: 'Accessibility pass', description: 'WCAG 2.2 AA across forms, dialogs and navigation.', color: EPIC_COLORS.E3, status: 'completed', health: 'on_track', leadId: uid.carol, startDate: isoDay(-45), targetDate: isoDay(-20), sortOrder: 3, createdAt: ago(48), updatedAt: ago(20) },
        ])
        .onConflictDoNothing();
      await db
        .insert(milestones)
        .values([
          { id: sid('web:milestone:design'), epicId: epicId('E1'), name: 'Design sign-off', description: 'Final mocks approved.', targetDate: isoDay(-25), sortOrder: 1, createdAt: ago(40) },
          { id: sid('web:milestone:beta'), epicId: epicId('E1'), name: 'Beta release', description: 'Guest checkout and confirmation page behind a flag.', targetDate: isoDay(10), sortOrder: 2, createdAt: ago(40) },
        ])
        .onConflictDoNothing();
      await db
        .insert(epicUpdates)
        .values([
          { id: sid('web:epic-update:e1-1'), epicId: epicId('E1'), authorId: uid.carol, health: 'on_track', body: 'Design is signed off and engineering is on the payment form. Beta is on schedule.', createdAt: ago(8) },
          { id: sid('web:epic-update:e1-2'), epicId: epicId('E1'), authorId: uid.alice, health: 'on_track', body: 'Order confirmation is in review. Guest checkout is the long pole.', createdAt: ago(1) },
          { id: sid('web:epic-update:e2-1'), epicId: epicId('E2'), authorId: uid.bob, health: 'at_risk', body: 'Search latency regression ate a week. Index fix is in review; edge caching might slip.', createdAt: ago(2) },
        ])
        .onConflictDoNothing();
      await db
        .insert(epicLabels)
        .values([
          { id: sid('web:epic-label:customer'), projectId: WEB, name: 'Customer-facing', color: '#f2994a', createdAt: now },
          { id: sid('web:epic-label:debt'), projectId: WEB, name: 'Tech debt', color: '#95a2b3', createdAt: now },
        ])
        .onConflictDoNothing();
      await db
        .insert(epicLabelLinks)
        .values([
          { epicId: epicId('E1'), labelId: sid('web:epic-label:customer') },
          { epicId: epicId('E2'), labelId: sid('web:epic-label:debt') },
        ])
        .onConflictDoNothing();
      await db
        .insert(epicRelations)
        .values({ id: sid('web:epic-relation:e2-e1'), epicId: epicId('E2'), relatedEpicId: epicId('E1'), type: 'related', createdById: uid.bob, createdAt: now })
        .onConflictDoNothing();
      log('cycles, initiative and epics ready');

      // ---- 5. Issues (through the service: counters, keys, activity) --------
      const rows = new Map<string, IssueRow>(); // `web:slug` / `ops:slug` -> issue
      const ids = new Map<string, string>(); // same keys -> issue id

      async function seedIssues(scope: 'web' | 'ops', projectId: string, specs: IssueSpec[]) {
        for (const s of specs) {
          const id = sid(`${scope}:issue:${s.k}`);
          const [existing] = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, id)).limit(1);
          const actor = s.by === 'system' ? SYSTEM_ACTOR : { userId: uid[s.by ?? 'alice'] };
          const res = await createIssue(
            actor,
            projectId,
            {
              title: s.t,
              description: s.d ?? null,
              stateId: stateId(scope, s.st),
              priority: s.pr ?? 'none',
              estimate: s.es ?? null,
              dueDate: s.due !== undefined ? isoDay(s.due) : null,
              startDate: s.start !== undefined ? isoDay(s.start) : null,
              assigneeId: s.as ? uid[s.as] : null,
              labelIds: (s.lb ?? []).map((l) => labelId(scope, l)),
              parentId: s.parent ? ids.get(`${scope}:${s.parent}`)! : null,
              cycleId: s.cy ? cycleId(s.cy) : null,
              epicId: s.ep ? epicId(s.ep) : null,
              milestoneId: s.ms ? sid(`web:milestone:${s.ms}`) : null,
            },
            { id },
          );
          if (!res.ok) throw new Error(`createIssue ${scope}/${s.k}: ${res.error}`);
          ids.set(`${scope}:${s.k}`, id);
          rows.set(`${scope}:${s.k}`, res.issue);

          // One-time follow-ups: only for issues created by this run.
          if (existing) continue;
          for (const [to, who] of s.moves ?? []) {
            const moved = await updateIssueFields({ userId: uid[who] }, projectId, id, { stateId: stateId(scope, to) });
            if (!moved.ok) throw new Error(`move ${scope}/${s.k} -> ${to}: ${moved.error}`);
            rows.set(`${scope}:${s.k}`, moved.issue);
          }
          if (s.life === 'archived') await archive({ userId: uid.alice }, projectId, id);
          if (s.life === 'trashed') await softDelete({ userId: uid.alice }, projectId, id);
        }
      }
      await seedIssues('web', WEB, WEB_ISSUES);
      await seedIssues('ops', OPS, OPS_ISSUES);
      const issueId = (k: string) => {
        const id = ids.get(`web:${k}`);
        if (!id) throw new Error(`unknown web issue ${k}`);
        return id;
      };
      const issueKey = (k: string) => rows.get(`web:${k}`)!.key;
      log(`issues ready (${ids.size})`);

      // ---- 6. Comments (threads, an edit, reactions) -------------------------
      const commentIds = new Map<string, string>();
      for (const c of COMMENTS) {
        const ticketId = issueId(c.on);
        const body = mention(c.body);
        const edited = c.edit ? mention(c.edit) : undefined;
        // Comments get random ids from the service, so match on content.
        const [found] = await db
          .select({ id: comments.id })
          .from(comments)
          .where(and(eq(comments.ticketId, ticketId), eq(comments.authorId, uid[c.by]), inArray(comments.body, edited ? [body, edited] : [body])))
          .limit(1);
        let id = found?.id;
        if (!id) {
          const res = await createCommentAs({ userId: uid[c.by] }, WEB, {
            ticketId,
            body,
            parentId: c.replyTo ? commentIds.get(c.replyTo) : undefined,
          });
          if (!res.ok) throw new Error(`comment ${c.key}: ${res.error}`);
          id = res.comment.id;
          if (edited) {
            const upd = await updateCommentAs({ userId: uid[c.by] }, WEB, { commentId: id, body: edited });
            if (!upd.ok) throw new Error(`edit comment ${c.key}: ${upd.error}`);
          }
        }
        commentIds.set(c.key, id);
        for (const [emoji, who] of c.reactions ?? []) {
          await db
            .insert(commentReactions)
            .values({ id: sid(`reaction:${c.key}:${who}:${emoji}`), commentId: id, userId: uid[who], emoji, createdAt: now })
            .onConflictDoNothing();
        }
      }
      log('comments ready');

      // ---- 7. Link attachments, relations, PR links --------------------------
      for (const l of LINKS) {
        const ticketId = issueId(l.on);
        const [dup] = await db
          .select({ id: attachments.id })
          .from(attachments)
          .where(and(eq(attachments.ticketId, ticketId), eq(attachments.url, l.url)))
          .limit(1);
        if (dup) continue;
        const res = await addLinkAttachment(uid.alice, WEB, { ticketId, url: l.url, title: l.title });
        if (!res.ok) throw new Error(`attachment ${l.title}: ${res.error}`);
      }
      for (const r of RELATIONS) {
        const res = await createIssueRelation(uid[r.by], WEB, { ticketId: issueId(r.from), relatedTicketId: issueId(r.to), kind: r.kind });
        // "already linked" on a re-run is the idempotent outcome, not a failure.
        if (!res.ok && !/already linked/i.test(res.error)) throw new Error(`relation ${r.from}->${r.to}: ${res.error}`);
      }
      const prs = [
        { k: 'order-confirm', number: 482, title: 'Order confirmation page', state: 'open', draft: false, branch: 'carol/order-confirmation', author: 'carol', review: 'review_required', checks: 'pending', days: 1 },
        { k: 'guest-checkout', number: 479, title: 'WIP: guest checkout', state: 'open', draft: true, branch: 'bob/guest-checkout', author: 'bob', review: null, checks: 'failure', days: 2 },
        { k: 'rounding', number: 412, title: 'Fix cart total rounding', state: 'merged', draft: false, branch: 'bob/fix-rounding', author: 'bob', review: 'approved', checks: 'success', days: 35 },
        { k: 'orders-index', number: 488, title: 'Add orders(user_id) index', state: 'open', draft: false, branch: 'alice/orders-index', author: 'alice', review: 'approved', checks: 'success', days: 1 },
      ];
      await db
        .insert(githubPullRequests)
        .values(
          prs.map((p) => ({
            id: sid(`web:pr:${p.number}`),
            projectId: WEB,
            ticketId: issueId(p.k),
            repo: 'acme/web',
            number: p.number,
            title: p.title,
            url: `https://github.com/acme/web/pull/${p.number}`,
            state: p.state,
            draft: p.draft,
            branch: p.branch,
            authorLogin: p.author,
            reviewDecision: p.review,
            checksState: p.checks,
            mergedAt: p.state === 'merged' ? ago(p.days - 1) : null,
            createdAt: ago(p.days),
            updatedAt: ago(Math.max(p.days - 1, 0)),
          })),
        )
        .onConflictDoNothing();
      log('attachments, relations and PR links ready');

      // ---- 8. Documents, view, favorites, templates, schedules ---------------
      await db
        .insert(documents)
        .values([
          {
            id: sid('web:doc:checkout-spec'),
            projectId: WEB,
            epicId: epicId('E1'),
            title: 'Checkout redesign spec',
            icon: '📐',
            content: md(
              '# Checkout redesign spec',
              '',
              '## Goals',
              '',
              '- Three steps instead of five',
              '- Guest checkout by default',
              '- Wallet payments (Apple Pay, Google Pay)',
              '',
              '## Errors',
              '',
              '| Situation | Copy |',
              '| --- | --- |',
              '| Card declined | Your card was declined. Try another card. |',
              '| Expired card | Your card has expired. |',
              '',
              '## Rollout',
              '',
              '1. Internal dogfood behind a flag',
              '2. 10% of traffic',
              '3. Everyone',
              '',
              `${FENCE}ts`,
              "if (flags.checkoutV2 && user.bucket < 10) return <CheckoutV2 />;",
              FENCE,
            ),
            createdById: uid.carol,
            updatedById: uid.alice,
            sortOrder: 1,
            createdAt: ago(30),
            updatedAt: ago(2),
          },
          {
            id: sid('web:doc:oncall'),
            projectId: WEB,
            title: 'On-call and release handbook',
            icon: '🗓️',
            content: md(
              '# On-call and release handbook',
              '',
              '## Release train',
              '',
              'We ship to production **every Tuesday and Thursday**.',
              '',
              '- [x] Changelog updated',
              '- [x] Smoke tests green',
              '- [ ] Announce in #web',
              '',
              '## Escalation',
              '',
              '1. Page the primary on-call',
              '2. If no ack in 10 minutes, page the secondary',
              '3. Open an incident in the Ops project',
            ),
            createdById: uid.bob,
            updatedById: uid.bob,
            sortOrder: 2,
            createdAt: ago(20),
            updatedAt: ago(5),
          },
        ])
        .onConflictDoNothing();

      const VIEW = sid('web:view:my-open-bugs');
      const displayBase = {
        layout: 'board', groupBy: 'priority', subGroupBy: null, orderBy: 'priority', showEmptyGroups: false, showSubIssues: true,
        properties: { id: true, status: true, priority: true, assignee: true, labels: true, estimate: true, dueDate: true, startDate: false, sla: true, created: true, updated: false, cycle: false, epic: true, milestone: false, subIssues: true, pullRequests: true },
      };
      await db
        .insert(savedViews)
        .values([
          {
            id: VIEW,
            ownerId: uid.alice,
            projectId: WEB,
            name: 'My open bugs',
            description: 'Bugs assigned to me that are not done yet.',
            filters: normalizeIssueFilters({ labelIds: [labelId('web', 'bug')], assigneeIds: ['me'], stateTypes: ['unstarted', 'started'] }) as unknown as Record<string, unknown>,
            display: displayBase,
            shared: true,
            createdAt: ago(10),
            updatedAt: ago(10),
          },
          {
            id: sid('web:view:due-soon'),
            ownerId: uid.alice,
            projectId: WEB,
            name: 'Due soon',
            filters: normalizeIssueFilters({ due: ['overdue', 'today', 'thisWeek'] }) as unknown as Record<string, unknown>,
            display: { ...displayBase, layout: 'list', groupBy: 'state', orderBy: 'dueDate' },
            shared: false,
            createdAt: ago(6),
            updatedAt: ago(6),
          },
        ])
        .onConflictDoNothing();
      await db
        .insert(favorites)
        .values([
          { id: sid('fav:alice:view'), userId: uid.alice, targetType: 'view', targetId: VIEW, sortOrder: 1, createdAt: now },
          { id: sid('fav:alice:epic'), userId: uid.alice, targetType: 'epic', targetId: epicId('E1'), sortOrder: 2, createdAt: now },
        ])
        .onConflictDoNothing();

      await db
        .insert(issueTemplates)
        .values([
          {
            id: sid('web:template:bug'),
            projectId: WEB,
            name: 'Bug report',
            title: '[Bug] ',
            description: md('## What happened', '', '## Expected', '', '## Steps to reproduce', '', '1. ', '', '## Environment', '', '- Browser:', '- OS:'),
            data: { priority: 'high', labelIds: [labelId('web', 'bug')] },
            createdById: uid.alice,
            createdAt: ago(30),
            updatedAt: ago(30),
          },
          {
            id: sid('web:template:feature'),
            projectId: WEB,
            name: 'Feature request',
            title: '',
            description: md('## Problem', '', '## Proposal', '', '## Alternatives considered'),
            data: { priority: 'medium', labelIds: [labelId('web', 'feature')], stateId: stateId('web', 'Backlog') },
            createdById: uid.carol,
            createdAt: ago(25),
            updatedAt: ago(25),
          },
        ])
        .onConflictDoNothing();

      // Recurring schedules. Start tomorrow so the first run is in the future
      // and the app's daily job doesn't create a surprise issue next to the seed.
      const recurring = [
        {
          id: sid('web:recurring:deps'),
          projectId: WEB,
          createdById: uid.alice,
          title: 'Weekly dependency update',
          description: 'Bump patch/minor versions and run the full e2e suite.',
          data: { priority: 'low', labelIds: [labelId('web', 'infra')], assigneeId: uid.bob, estimate: 1, dueInDays: 3 },
          schedule: { freq: 'weekly', interval: 1, weekdays: [1], start: isoDay(1) },
        },
        {
          id: sid('ops:recurring:billing'),
          projectId: OPS,
          createdById: uid.alice,
          title: 'Monthly cloud bill review',
          description: 'Compare against budget and flag anomalies.',
          data: { priority: 'medium', labelIds: [labelId('ops', 'infra')], assigneeId: uid.alice, dueInDays: 5 },
          schedule: { freq: 'monthly', interval: 1, dayOfMonth: 1, start: isoDay(1) },
        },
      ];
      for (const r of recurring) {
        const parsed = normalizeSchedule(r.schedule);
        if (!parsed.ok) throw new Error(`bad schedule ${r.title}: ${parsed.error}`);
        const next = firstRunFrom(parsed.schedule, now, null);
        if (!next) throw new Error(`schedule ${r.title} has no runs`);
        await db
          .insert(recurringIssues)
          .values({ ...r, schedule: parsed.schedule as unknown as Record<string, unknown>, nextRunAt: next, enabled: true, createdAt: ago(14), updatedAt: ago(14) })
          .onConflictDoNothing();
      }

      // A project template made from Web's current setup (states, labels, SLA,
      // issue templates), shared with the workspace.
      const snapshot = await snapshotProject(WEB);
      if (snapshot) {
        await db
          .insert(projectTemplates)
          .values({
            id: sid('template:web-team'),
            ownerId: uid.alice,
            workspaceId: WS,
            name: 'Product team defaults',
            description: 'Workflow, labels, SLA policy and issue templates from Web.',
            config: snapshot as unknown as Record<string, unknown>,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
      }
      log('documents, views, templates and schedules ready');

      // ---- 9. Customers + requests -------------------------------------------
      const GLOBEX = sid('web:customer:globex');
      const INITECH = sid('web:customer:initech');
      await db
        .insert(customers)
        .values([
          { id: GLOBEX, projectId: WEB, name: 'Globex Corporation', domains: ['globex.com'], revenue: 250_000, size: 1200, tier: 'Enterprise', status: 'active', ownerId: uid.alice, notes: 'Largest account. Renewal in Q1. Cares most about checkout reliability.', createdAt: ago(60), updatedAt: ago(3) },
          { id: INITECH, projectId: WEB, name: 'Initech', domains: ['initech.io'], revenue: 40_000, size: 85, tier: 'Pro', status: 'lead', ownerId: uid.carol, notes: 'In a trial. Wants accounting exports.', createdAt: ago(20), updatedAt: ago(1) },
        ])
        .onConflictDoNothing();
      await db
        .insert(customerRequests)
        .values([
          { id: sid('web:request:globex-1'), projectId: WEB, ticketId: issueId('pay-validate'), customerId: GLOBEX, importance: 'critical', source: 'manual', body: 'Our buyers keep getting a generic error when a card is declined. This is costing us orders.', createdAt: ago(5) },
          { id: sid('web:request:globex-2'), projectId: WEB, ticketId: issueId('slow-search'), customerId: GLOBEX, importance: 'high', source: 'manual', body: 'Product search takes several seconds during peak hours.', createdAt: ago(3) },
          { id: sid('web:request:globex-3'), projectId: WEB, ticketId: issueId('safari-login'), customerId: GLOBEX, importance: null, source: 'intake', name: 'Jane Doe', email: 'jane@globex.com', body: "Clicking Log in does nothing for me on Safari 16.4 / macOS. Works in Chrome.", createdAt: ago(1) },
          { id: sid('web:request:initech-1'), projectId: WEB, ticketId: issueId('csv-export'), customerId: INITECH, importance: 'medium', source: 'intake', name: 'Priya N', email: 'priya@initech.io', body: 'We need to export our order history as CSV for accounting.', createdAt: ago(0.7) },
        ])
        .onConflictDoNothing();

      // ---- 10. Dashboards -----------------------------------------------------
      const widget = (key: string, type: Widget['type'], title: string, size: [number, number], config: Partial<Widget['config']> = {}, q?: string): Widget => {
        const w = newWidget(type, WEB);
        return {
          ...w,
          id: sid(`widget:${key}`),
          title,
          w: size[0],
          h: size[1],
          config: { ...w.config, ...config, filters: q !== undefined ? normalizeIssueFilters({ q }) : w.config.filters },
        };
      };
      await db
        .insert(dashboards)
        .values([
          {
            id: sid('web:dashboard:overview'),
            ownerId: uid.alice,
            projectId: WEB,
            name: 'Web team overview',
            description: 'Health of the Web project at a glance.',
            shared: true,
            widgets: normalizeWidgets([
              widget('open', 'number', 'Open issues', [1, 1], {}, 'is:open'),
              widget('urgent', 'number', 'Urgent and high', [1, 1], { filters: normalizeIssueFilters({ priorities: ['urgent', 'high'], stateTypes: ['unstarted', 'started'] }) }),
              widget('by-status', 'bar', 'Open issues by status', [2, 1], { groupBy: 'state' }, 'is:open'),
              widget('flow', 'line', 'Created vs completed', [2, 2], { weeks: 12 }),
              widget('cycle', 'cycle', 'Current cycle', [2, 1]),
              widget('epics', 'epic', 'Epic progress', [2, 1]),
              widget('recent', 'list', 'Recently updated', [4, 2], { orderBy: 'updated', limit: 10 }, 'is:open'),
              widget('tis', 'timeInStatus', 'Time in status', [2, 1], {}, 'is:open'),
            ]) as unknown as Record<string, unknown>[],
            createdAt: ago(12),
            updatedAt: ago(2),
          },
          {
            id: sid('alice:dashboard:my-work'),
            ownerId: uid.alice,
            projectId: null,
            name: 'My work',
            description: 'Everything assigned to me across projects.',
            shared: false,
            widgets: normalizeWidgets([
              { ...widget('mine-open', 'number', 'Assigned to me', [1, 1], { projectId: null, filters: normalizeIssueFilters({ assigneeIds: ['me'], stateTypes: ['unstarted', 'started'] }) }) },
              { ...widget('mine-list', 'list', 'My open issues', [4, 2], { projectId: null, orderBy: 'priority', limit: 10, filters: normalizeIssueFilters({ assigneeIds: ['me'], stateTypes: ['unstarted', 'started'] }) }) },
            ]) as unknown as Record<string, unknown>[],
            createdAt: ago(9),
            updatedAt: ago(9),
          },
        ])
        .onConflictDoNothing();

      // ---- 11. Members page extras: pending invites, a draft -----------------
      await db
        .insert(workspaceInvitations)
        .values({ id: sid('wsinvite:dave'), workspaceId: WS, email: 'dave@acme.test', role: 'member', token: `seed-ws-invite-${sid('wsinvite:dave')}`, invitedById: uid.alice, expiresAt: new Date(Date.now() + 7 * DAY), createdAt: ago(1) })
        .onConflictDoNothing();
      await db
        .insert(invitations)
        .values({ id: sid('invite:web:erin'), projectId: WEB, token: `seed-invite-${sid('invite:web:erin')}`, email: 'erin@acme.test', role: 'member', invitedById: uid.alice, expiresAt: new Date(Date.now() + 7 * DAY), createdAt: ago(1) })
        .onConflictDoNothing();
      await db
        .insert(issueDrafts)
        .values({ id: sid('draft:alice:web'), userId: uid.alice, projectId: WEB, title: 'Investigate checkout drop-off on mobile', description: 'Funnel shows a 12% drop between shipping and payment on small screens.', data: {}, createdAt: ago(1), updatedAt: ago(1) })
        .onConflictDoNothing();

      // ---- 12. Back-date the issues' timeline (first run only) -----------------
      // The service stamps everything "now". Spread each issue's creation,
      // state-change timestamps, SLA clock, activity and comments over its `age`
      // so insights, burndown, "time in status" and SLA chips look lived-in.
      // An issue still created within the last 6h hasn't been back-dated yet
      // (every spec is >= 12h old, so a back-dated issue never matches again).
      for (const [slug, spec] of [...WEB_ISSUES.map((s) => ['web', s] as const), ...OPS_ISSUES.map((s) => ['ops', s] as const)]) {
        await backdate(ids.get(`${slug}:${spec.k}`)!, spec.age, spec.closeAfter ?? 4);
      }
      log('timeline back-dated');

      // ---- 13. Inbox: let the fan-out finish, then shape it --------------------
      await drain();
      // The notifications Alice (and the others) have so far were generated by
      // the app's dispatcher (assigned, mentioned, commented, status changes).
      // Space them over the last days and read a few; `seed: true` marks a row
      // as shaped so a re-run leaves it alone.
      for (const key of Object.keys(uid) as U[]) {
        const fresh = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(and(eq(notifications.userId, uid[key]), sql`${notifications.data}->>'seed' is null`))
          .orderBy(notifications.createdAt);
        for (const [i, n] of fresh.entries()) {
          const at = new Date(Date.now() - (fresh.length - i) * 5 * HOUR);
          await db
            .update(notifications)
            .set({
              createdAt: at,
              readAt: i % 3 === 0 && i < fresh.length - 3 ? new Date(at.getTime() + HOUR) : null,
              data: sql`${notifications.data} || '{"seed": true}'::jsonb`,
            })
            .where(eq(notifications.id, n.id));
        }
      }
      // Types the dispatcher doesn't create on its own (cron / user driven).
      const k = (slug: string) => rows.get(`web:${slug}`)!;
      await db
        .insert(notifications)
        .values([
          { id: sid('notif:alice:reminder'), userId: uid.alice, projectId: WEB, ticketId: issueId('address-auto'), actorId: null, type: 'reminder', data: { seed: true, key: k('address-auto').key, title: k('address-auto').title }, readAt: null, createdAt: ago(0.2) },
          { id: sid('notif:alice:snoozed'), userId: uid.alice, projectId: WEB, ticketId: issueId('edge-cache'), actorId: null, type: 'reminder', data: { seed: true, key: k('edge-cache').key, title: k('edge-cache').title }, snoozedUntil: new Date(Date.now() + 2 * DAY), createdAt: ago(1.5) },
          { id: sid('notif:alice:sla'), userId: uid.alice, projectId: WEB, ticketId: issueId('pay-validate'), actorId: null, type: 'sla_breached', data: { seed: true, key: k('pay-validate').key, title: k('pay-validate').title, summary: 'missed its 48h urgent SLA' }, readAt: null, createdAt: ago(0.4) },
          { id: sid('notif:alice:recurring'), userId: uid.alice, projectId: WEB, ticketId: issueId('deps'), actorId: null, type: 'recurring_created', data: { seed: true, key: k('deps').key, title: k('deps').title, summary: 'created from the "Weekly dependency update" schedule' }, readAt: ago(8), createdAt: ago(9) },
          { id: sid('notif:alice:pulse'), userId: uid.alice, projectId: null, ticketId: null, actorId: null, type: 'pulse', data: { seed: true, summary: 'Your weekly pulse: 6 issues completed, 2 overdue', lines: ['6 issues completed', '2 overdue', 'Cycle 2 is 45% complete'], url: '/dashboard/dashboards?tab=pulse' }, readAt: null, createdAt: ago(2) },
          { id: sid('notif:alice:archived'), userId: uid.alice, projectId: WEB, ticketId: issueId('rounding'), actorId: uid.bob, type: 'commented', data: { seed: true, key: k('rounding').key, title: k('rounding').title, excerpt: 'Fixed in the latest release.' }, readAt: ago(30), archivedAt: ago(29), createdAt: ago(31) },
        ])
        .onConflictDoNothing();
      log('inbox ready');

      // ---- Summary -----------------------------------------------------------
      const tables = { users, workspaces, projects, workflowStates, labels, tickets, issueLabels, issueRelations, comments, commentReactions, attachments, githubPullRequests, activities, cycles, epics, milestones, epicUpdates, initiatives, documents, savedViews, favorites, customers, customerRequests, dashboards, issueTemplates, recurringIssues, projectTemplates, notifications, issueDrafts, workspaceInvitations, invitations } as const;
      const summary: Record<string, number> = {};
      for (const [name, table] of Object.entries(tables)) {
        const [{ n }] = await db.select({ n: count() }).from(table);
        summary[name] = Number(n);
      }
      console.table(summary);

      // Cheap sanity checks (they would fail loudly on a half-seeded database).
      const [{ web }] = await db.select({ web: count() }).from(tickets).where(and(eq(tickets.projectId, WEB), isNull(tickets.deletedAt)));
      expect(Number(web)).toBeGreaterThanOrEqual(40);
      expect(summary.users).toBeGreaterThanOrEqual(3);
      expect(summary.notifications).toBeGreaterThan(0);
    },
    10 * 60_000,
  );
});

/**
 * Move an issue's timestamps (and its activity/comments) into the past.
 * `age` = days since creation, `closeAfter` = days from creation to done/canceled.
 */
async function backdate(ticketId: string, age: number, closeAfter: number) {
  const [t] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!t || t.createdAt.getTime() < Date.now() - 6 * HOUR) return; // already back-dated

  const nowMs = Date.now();
  const created = new Date(nowMs - age * DAY);
  const shift = t.createdAt.getTime() - created.getTime();
  const startedAt = t.startedAt ? new Date(created.getTime() + Math.min(1, age / 3) * DAY) : null;
  const closedMs = created.getTime() + Math.min(closeAfter, age * 0.8) * DAY;
  const completedAt = t.completedAt ? new Date(Math.max(closedMs, (startedAt ?? created).getTime())) : null;
  const canceledAt = t.canceledAt ? new Date(Math.max(closedMs, (startedAt ?? created).getTime())) : null;
  const closedAt = completedAt ?? canceledAt;
  const open = closedAt ?? new Date(created.getTime() + (nowMs - created.getTime()) * 0.6);
  const archivedAt = t.archivedAt ? new Date(Math.min(nowMs - DAY, open.getTime() + 3 * DAY)) : null;
  const deletedAt = t.deletedAt ? new Date(nowMs - 0.5 * DAY) : null;
  const updatedAt = archivedAt ?? deletedAt ?? open;

  await db
    .update(tickets)
    .set({
      createdAt: created,
      updatedAt,
      startedAt,
      completedAt,
      canceledAt,
      archivedAt,
      deletedAt,
      stateChangedAt: closedAt ?? startedAt ?? created,
      slaDueAt: t.slaDueAt ? new Date(t.slaDueAt.getTime() - shift) : null,
    })
    .where(eq(tickets.id, ticketId));

  // Activity and comments share one timeline: the first event (issue.created)
  // sits at creation, the rest spread evenly up to the last update; a comment
  // takes the time of the activity that announced it.
  const events = await db
    .select({ id: activities.id, type: activities.type, data: activities.data })
    .from(activities)
    .where(eq(activities.ticketId, ticketId))
    .orderBy(sql`(${activities.type} = 'issue.created') desc`, activities.createdAt, activities.id);
  const span = updatedAt.getTime() - created.getTime();
  for (const [i, ev] of events.entries()) {
    const at = new Date(created.getTime() + (events.length > 1 ? (span * i) / (events.length - 1) : 0));
    await db.update(activities).set({ createdAt: at }).where(eq(activities.id, ev.id));
    const commentId = typeof ev.data?.commentId === 'string' ? ev.data.commentId : null;
    if (!commentId) continue;
    if (ev.type === 'comment.created') {
      await db.update(comments).set({ createdAt: at, updatedAt: at }).where(eq(comments.id, commentId));
    } else if (ev.type === 'comment.updated') {
      await db.update(comments).set({ editedAt: at, updatedAt: at }).where(eq(comments.id, commentId));
    }
  }
  await db
    .update(attachments)
    .set({ createdAt: new Date(created.getTime() + HOUR) })
    .where(eq(attachments.ticketId, ticketId));
}
