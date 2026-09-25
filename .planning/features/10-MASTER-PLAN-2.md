# Linear Parity II — Master Plan

Checklist: `.planning/LINEAR-FEATURE-GAPS.md` (round 2). Paid items:
`.planning/PAID-FEATURES.md`. Per-feature plan docs: `.planning/features/D*-*.md`.
Round-1 contracts still apply: `CONTRACTS.md`, `00-MASTER-PLAN.md`.

## Wave 0 (done by the orchestrator)
- **Deps**: Tiptap 3 (`@tiptap/react`, `starter-kit`, `markdown`, mention, image,
  placeholder, task list/item, suggestion, collaboration + caret), `yjs`,
  `y-protocols`, `graphql` 16 + `graphql-yoga`, `web-push`, Better Auth 1.6.33 +
  `@better-auth/sso`, `@better-auth/scim`, `@better-auth/oauth-provider` (pinned
  exactly — 1.7 breaks the peer graph).
- **Auth plugins** wired in `src/lib/auth.ts` / `auth-client.ts`: `twoFactor`
  (client redirects to `/login/two-factor`), `jwt`, `oauthProvider` (login
  `/login`, consent `/oauth/consent`, scopes openid profile email offline_access
  read write), `sso`, `scim`. Tables in `schema.ts` (`two_factor`, `jwks`,
  `sso_provider`, `scim_provider`, `oauth_*`) + `workspace_sso` link table.
- **Schema** (migrations 0006–0008, applied): ticket `startDate`, `slaDueAt`,
  `slaBreachedAt`, `stateChangedAt`; project `parentId`, `visibility`
  ('private'|'workspace'), `cycleCooldownWeeks`, `slaPolicy`; github_pull_request
  `provider`, `reviewDecision`, `checksState`; customer_request `customerId`,
  `importance`, `source`; user_profile `digestFrequency`, `lastDigestAt`,
  `pushNotifications`; new tables `ticket_key_alias`, `project_template`,
  `epic_label`, `epic_label_link`, `epic_relation`, `recurring_issue`, `customer`,
  `slack_installation`, `slack_user_link`, `dashboard`, `document`, `collab_doc`,
  `collab_update`, `push_subscription`, `webhook_delivery`, `project_integration`,
  `upload`; `pg_trgm` + GIN trigram index on `ticket.title`.
- **Issue model/service**: `IssueRow` + `IssuePatch` gain `startDate`; `IssueRow`
  gains `slaDueAt`, `slaBreachedAt`, `stateChangedAt`. The service sets
  `stateChangedAt` on state changes and `slaDueAt` from `project.slaPolicy`
  (`{ priority: hours }`) on create / priority change (`slaDeadline()` export).
- **Cron**: `vercel.json` daily cron → `/api/cron/daily` (Bearer `CRON_SECRET`)
  → `src/lib/cron/index.ts` runs `src/lib/cron/jobs/*` (automations sweep done;
  stubs: recurring, sla (D5), digests (D11), pulse (D8), webhook-retries (D10a)).
- **Notification channels**: dispatch.ts → `deliverToChannels(rows)` in
  `src/lib/notifications/channels/` (stubs `push.ts` D11, `slack-dm.ts` D7).
  Jobs that insert notifications directly should call it too.
- **Slots** in IssueDetail: `PropertyStartDate` (D8), `PropertySla` (D5),
  `SectionSimilar` (D9), `SectionCustomers` (D6), `MenuMove` (D4a).
  `src/components/sla/sla-chip.tsx` stub (D5) for D8's rows/cards/table.
- **Nav + stub pages**: Dashboards, Project templates (top); Docs, Customers
  (project tabs + sidebar); account settings Security, OAuth apps, Slack; project
  settings SLAs, Recurring issues, GitLab/Bitbucket/Sentry (`developer`), Audit
  log; workspace `security`, `audit` routes.
- **Env** (all optional, documented in `env.template`): `CRON_SECRET`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
  `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`.

## Wave 1 (parallel)
| Agent | Features |
|---|---|
| D1 editor | WYSIWYG editor (slash commands, image paste, embeds incl. Figma) |
| D3 sync | local-first sync: offline outbox, cross-tab sync, SSE live updates |
| D4a structure | move issues between teams, sub-teams, private teams, project templates, cross-project epics (service side) |
| D4b epics | cross-project epics (UI), project (epic) labels, project dependencies |
| D5 issues | recurring issues, SLAs, time in status, cycle capacity / cooldown |
| D6 customers | customer entities + requests |
| D7 slack app | Linear Asks (Slack intake), per-user Slack notifications |
| D8 views | dashboards, pulse, issue timeline view, search query syntax |
| D9 smart | duplicate detection, triage suggestions (heuristic) |
| D10a api | GraphQL API, OAuth apps, webhook retries |
| D10b dev tools | GitLab / Bitbucket, PR reviews + CI status, Sentry, Asana / Shortcut import |
| D11 notify | web push, email digests |
| D12 security | 2FA, SAML SSO / SCIM, audit log export |

## Wave 2
D2 docs & collaboration (project documents + real-time co-editing on top of
D1's editor), then integration fixes, build, browser smoke test, checklist.

## $0 decisions
- Realtime: SSE (short-lived streams, reconnecting) + polling fallback; Yjs
  updates relayed through Postgres (`collab_update`), no websocket server.
- Scheduled work: one Vercel Hobby cron per day + lazy runs on page load.
- Smart features: Postgres trigram/full-text heuristics, no LLM.
- Push: standard Web Push with self-generated VAPID keys.
