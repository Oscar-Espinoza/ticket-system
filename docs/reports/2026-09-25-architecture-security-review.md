# Architecture and security review — 2026-09-25

Reviewed commit: `cfda02f` (`cfda02f` was HEAD; the working tree was clean).

Scope: the current implementation, particularly the Linear Parity II changes, checked against `.planning/features/` and `docs/API.md`. No separate proposal or uncommitted diff was supplied. Findings below are concrete defects, ordered by impact. P1 means high priority; P2 means a substantive reliability issue worth fixing.

Validation: source tracing, inspection of the installed Better Auth account-linking implementation, and three isolated Node probes using the actual TypeScript modules with mocked dependencies. No live database, identity provider, or internal network was contacted. Concurrency findings describe reachable interleavings; they were not exercised against a deployed database. Application code and configuration were not changed.

## 1. [P1] A verified mailbox grants authority to impersonate the entire email domain

**Evidence:** [SSO domain proof](../../src/app/actions/security.ts#L317), [self-service workspace creation](../../src/app/actions/workspaces.ts#L108), [trusted IdP email claims](../../src/lib/auth.ts#L135), and [SSO account-linking override](../../src/lib/sso.ts#L544).

`saveWorkspaceSso` accepts the administrator's verified email as proof of control over its entire domain. Any signed-in user can create a workspace and become its owner. Consequently, an ordinary employee with a verified `employee@company.example` account can register an attacker-controlled IdP for `company.example`, provided no workspace has already claimed that domain. They do not need DNS control or authority over the company's existing projects.

The IdP can then assert another user's address on that domain with `email_verified: true`. The configured SSO callback permits implicit linking, and the installed Better Auth `handleOAuthUserInfo` implementation resolves existing users by email and issues a session after linking. `assertIdentityDomain` accepts the assertion because the victim shares the claimed domain. The resulting identity is the victim's global account, including access outside the attacker's workspace. This is an account-takeover path, not merely an incorrect workspace invitation.

**Change:** require proof of administrative control over the domain, such as the existing DNS challenge, before trusting an IdP to assert identities for other users. Mailbox verification alone must not authorize domain-wide account linking or login enforcement. The D12 plan's mailbox-based proof requirement itself needs correction.

## 2. [P1] The webhook SSRF guard accepts private IPv4 addresses represented as IPv6

**Evidence:** [IPv6 address classification](../../src/lib/integrations/url-guard.ts#L35), [delivery-time validation](../../src/lib/integrations/url-guard.ts#L94), and [outbound webhook request](../../src/lib/integrations/outgoing-webhooks.ts#L100).

The IPv4-mapped IPv6 check only recognizes a dotted-decimal suffix. Node's URL parser canonicalizes that suffix into hexadecimal, so addresses such as `::ffff:7f00:1` miss both that check and the remaining IPv6 private-address checks. Both URL saving and delivery therefore accept destinations that the production policy explicitly prohibits.

A local probe of the actual module with `NODE_ENV=production` returned:

| URL | Canonical hostname | `isDeliverableUrl` |
| --- | --- | --- |
| `https://127.0.0.1/` | `127.0.0.1` | `false` |
| `https://[::ffff:127.0.0.1]/` | `[::ffff:7f00:1]` | `true` |
| `https://[::ffff:10.0.0.1]/` | `[::ffff:a00:1]` | `true` |
| `https://[::ffff:169.254.169.254]/` | `[::ffff:a9fe:a9fe]` | `true` |

This establishes a bypass of the address boundary. HTTPS certificate verification still applies; the probe did not establish access to a particular internal service.

**Change:** parse IPv6 addresses into their numeric representation and classify mapped IPv4 addresses with the IPv4 rules, including DNS results. Add coverage for hexadecimal and expanded mapped forms, not just the textual dotted form.

## 3. [P1] Customer requests expose live details of issues moved into private projects

**Evidence:** [customer-detail query and returned request objects](../../src/lib/customers.ts#L162), [issue move](../../src/lib/issue-service.ts#L1289), and [move contract retaining customer requests in the source project](../../.planning/features/D4a-move-issues.md).

Move an issue with a customer request from project A into private project B. The request intentionally remains in A and retains its `ticketId`. A user who belongs only to A can still load that customer's detail page. Its request query authorizes membership in `customerRequests.projectId`, but joins the current ticket solely by ID and returns its live title, number, workflow state, and archive status without checking membership in B.

Changing the issue's title after the move therefore exposes new private information to a source-only member. The later, correctly scoped `queryIssues` call does not fix this: the earlier `requests[].issue` objects are returned independently. Those objects also construct an invalid issue key by combining A's project prefix with B's ticket number.

**Change:** authorize each linked ticket against its current project before returning any ticket fields. Keep the source customer request, but hide inaccessible issue details. For accessible moved issues, use the current project's key and destination. This is required by the members-only private-project contract.

## 4. [P1] Offline replay duplicates successful creates when the response is lost

**Evidence:** [network-failure enqueue](../../src/lib/sync/outbox.ts#L228), [replay](../../src/lib/sync/outbox.ts#L274), [create action](../../src/app/actions/tickets.ts#L36), and [server-generated issue ID](../../src/lib/issue-service.ts#L740).

The outbox assumes a failed response means the operation must be sent again. If `createTicket` commits and its response is lost, `perform` queues the same arguments. Replay calls `createTicket` again, which generates a new UUID and allocates another ticket number. A tab terminating after a successful replay but before `deleteItem` creates the same ambiguity.

An isolated probe of the actual outbox module mocked a server that committed once and then threw `TypeError` to represent a lost response. One intended create produced `serverCalls: 2` and `committedIssues: 2`. Web Locks cannot prevent this; the duplicate arises across sequential attempts.

**Change:** assign a stable operation ID before the first request, retain it in the outbox, and deduplicate it transactionally on the server. Replays must return the original result. The operation ID must cover the initial online attempt as well as subsequent offline retries.

## 5. [P1] An old tab can replay one user's queued changes as another user

**Evidence:** [tab-local user selection](../../src/lib/sync/outbox.ts#L199), [queued action dispatch](../../src/lib/sync/outbox.ts#L279), [action registry](../../src/lib/sync/actions.ts#L39), and [server session authorization](../../src/app/actions/tickets.ts#L36).

Outbox items contain a `userId`, but it is only compared with the tab's in-memory `currentUser`. Replay sends `head.args`; it does not send or enforce the queue owner's identity. Server actions authorize whichever account the browser's current session cookie represents.

Leave A's tab open with queued changes, then sign out and sign in as B in another tab. On focus or reconnection, A's stale tab can drain its queue using B's cookie. If both accounts can write to the project, A's edits are applied and audited as B. If B cannot access it, the rejection causes A's queued changes to be deleted. This violates the explicit D3 requirement that only the signed-in user's items replay.

An isolated outbox probe queued a create for `user-a`, changed the mocked authenticated identity to `user-b`, and flushed without updating the old tab's state. The action executed as `user-b`.

**Change:** include the expected queue-owner ID in the replay envelope and compare it with the authenticated session before applying any operation. Treat an identity mismatch as a suspended queue, not a permanent validation failure. Account changes should also stop stale replay loops across tabs.

## 6. [P1] Opening an issue description can overwrite newer, durable collaborative edits

**Evidence:** [Markdown-wins reconciliation](../../src/components/collab/use-collab-editor.ts#L100), [1.5-second snapshot debounce](../../src/components/collab/use-collab-editor.ts#L128), [issue editor selects Markdown as truth](../../src/components/issue-detail/slots/description-editor.tsx#L177), and [independent collaborative persistence](../../src/app/api/collab/[key]/route.ts#L174).

The Yjs document and `ticket.description` are separate persistence paths. On opening an issue editor, any mismatch is treated as an external Markdown edit: when no peers are present, `setContent` replaces the collaborative document with the Markdown snapshot. There is no revision or provenance check to establish which copy is newer.

A concrete loss window is a Yjs update successfully reaching the server, followed by the browser process terminating before the debounced Markdown save. After awareness expires, the next editor loads the newer Yjs state and then replaces it with the older `ticket.description`. The replacement is itself broadcast and persisted as a new Yjs edit. A stale page snapshot can cause the same overwrite even when the previous editor saved successfully. Periodic Yjs resynchronization cannot repair a newer overwrite operation.

**Change:** establish one authoritative description state and version its projections. External API/raw-mode writes must advance that same version or become explicit collaborative updates. Do not use absence of peers or string inequality to decide that a Markdown snapshot should replace durable collaborative state.

## 7. [P1] A losing concurrent issue move still rewrites labels and project-owned metadata

**Evidence:** [move reads before the write transaction](../../src/lib/issue-service.ts#L1177) and [conditional ticket updates followed by unconditional dependent writes](../../src/lib/issue-service.ts#L1289).

Two requests can both read issue X in source project A and prepare moves to B and C. If the move to B commits first, the second request's ticket update matches zero rows because its predicate still requires `projectId = A`. Nevertheless, its batch continues: it replaces X's labels with C's labels and sets X's activity, PR, and notification project IDs to C using only the previously collected ticket IDs.

The second request ultimately returns not found when it cannot reload X in C, but its batch has already committed. X remains in B with dependent records pointing at C. The target counter lock protects number allocation; it does not protect the source issue or assert that the move succeeded. The separate tree-read phase also permits newly attached descendants to be missed by a move.

**Change:** make the source ownership/version check and every dependent rewrite one atomic operation that aborts on any missing or changed source row. Serialize move and hierarchy mutations using a shared locking or version protocol, and validate the complete subtree inside that boundary. Checking the final read after committing is too late.

## 8. [P2] Recurring-job claims permanently skip occurrences if a worker terminates

**Evidence:** [claim advances the schedule before creation](../../src/lib/recurring.ts#L184) and [best-effort release](../../src/lib/recurring.ts#L199).

The recurring runner commits `nextRunAt = next` and `lastRunAt = now` before it calls `createFromSchedule`. A process termination or function timeout in between leaves the occurrence marked as handled without an issue. Future runners skip it because its due time has advanced; a monthly recurrence can lose the entire month's issue. The catch block cannot recover a terminated process, and even caught errors leave the occurrence skipped if the release update fails.

The opposite failure is also possible: an issue commits, its database response is lost, and the catch block restores the schedule. A later run then creates a duplicate because the issue is not uniquely associated with its recurrence occurrence.

**Change:** use a durable occurrence identity with a unique constraint and either commit issue creation and schedule advancement together or use an expiring claim that can safely resume the same occurrence. Advancing the schedule alone is not a recoverable job claim.

## 9. [P2] Webhook retry records are created after the point where events can be lost

**Evidence:** [after-response fan-out](../../src/lib/events.ts#L125), [delivery records created inside the dispatcher](../../src/lib/integrations/outgoing-webhooks.ts#L238), and [retry selection limited to existing deliveries](../../src/lib/integrations/outgoing-webhooks.ts#L278).

An issue mutation and its activity can commit successfully, then the process can terminate before the after-response dispatcher creates `webhook_delivery` rows. A transient database error while loading webhook targets/context or inserting those rows has the same effect: `deliverWebhooks` catches it and only logs it. The retry cron scans existing delivery rows, so it cannot discover or recover these events. Admins cannot redeliver them because they never appear in the delivery log.

Creating issues has an additional gap: the issue insert commits before `emitIssueEvent` writes activity, and an activity failure is swallowed. That leaves neither an event nor a delivery to recover, despite the successful issue response.

**Change:** persist a dispatch intent or recoverable event in the same transaction as the mutation. Have a retryable dispatcher materialize deliveries from that durable source, with uniqueness by event and receiver. `after()` can accelerate processing, but it must not be the only record that processing remains necessary.

---

## Resolution (2026-11-02)

All nine findings are fixed on `main`. Two cross-vendor reviews of the fixes
(Codex gpt-6.1-sol xhigh, Codex gpt-6-astra xhigh) found twelve gaps, which were
fixed too. Database behavior is tested against a real Postgres
(`src/tests/local-db`, `npm run test:db`), and each new guard was checked by
removing it and confirming that a test fails.

| # | Fix | Commits |
| --- | --- | --- |
| 1 | SSO needs the DNS TXT record (a mailbox no longer proves the domain). The record is re-checked whenever the IdP's domain authority is used, and callbacks and sessions through an unproven IdP are refused, including for identities it linked earlier. | 3490c02, 90f16e6 |
| 2 | IPv6 is classified numerically (mapped, compatible, NAT64, 6to4, Teredo). Every admin-supplied URL (webhooks, GitLab, Bitbucket, importers, Sentry) goes through `guardedRequest`: DNS pinned to a public answer, no redirects, an absolute deadline and a size cap. | 2eeabb6, 7fb268f |
| 3 | Customer and intake pages join a linked issue only through membership of its current project, and use that project's key. | 284f260, ecfd784 |
| 4 | Creates carry a client id and the server returns the existing issue on a retry. Queues stored by older builds get a key before replay. | f240f9c, ae6f078 |
| 5 | Outbox calls carry the queue owner. A session for another account suspends the queue instead of running it. | f240f9c |
| 6 | `ticket.description_source` records whether the collab editor or something else wrote the description, and `description_rev` counts external writes. The editor reconciles against the server copy. An external edit is applied, even when peers are present, only if the doc hasn't adopted that revision yet; the revision is written into the Y.Doc in the same Yjs transaction as the adopted content. | 6a9fdb9, 7333a30, 80255d4 |
| 7 | A move's batch starts with a guard that locks the tree and aborts unless it is unchanged. Updates, lifecycle changes, purge and parent links start with `assertIssuesInProject`. | aa344c3, 781e733 |
| 8 | Recurring runs create the occurrence's issue (an HMAC-derived id) before advancing the schedule. | 0f29d63, 89afe4c |
| 9 | Deliverable events store `activity.webhook_pending_project_id` in the mutation's transaction. It is cleared together with the creation of the delivery rows, which are unique per event and receiver. A sweep runs lazily and from the cron. Issue create and move, and comment create, edit and delete, write their events in their own transaction. | 8da18f3, 446852f, e7ed00c |

Deploy: run `npm run db:migrate` (migration `0009_reliability_fixes`) before
the new code.

### Follow-ups (not blocking)

- Other event producers still write their activity row after their own commit,
  so a crash in between loses that webhook: relations, attachments, epics,
  members, workflow states and the SLA jobs. The fix is the same pattern
  (`prepareIssueEvents` inside the write batch).
- Webhook payloads load the issue's current details by id
  (`src/lib/integrations/event-context.ts`). An event swept after its issue
  moved into a private project, and was then edited there, can carry the
  issue's new title or assignee to the source project's receivers. Scope that
  lookup to the event's project. This predates these fixes.
