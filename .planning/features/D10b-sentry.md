# D10b — Sentry integration

## Goal
Sentry issue alerts become triage issues automatically (deduplicated), and
resolving the Sentry issue is recorded on the linked issue.

## UX
Settings → GitLab, Bitbucket & Sentry → **Sentry** section: steps to create an
Internal Integration in Sentry (Webhook URL = shown copyable URL, enable
"Alert Rule Action" + the `issue` webhook), paste its Client Secret (+ optional auth token for event counts) → Connect.
Connected: webhook URL (copy), Replace secret, Disconnect. In Sentry, add
"Send a notification via <integration>" to an issue alert rule.
Linking an existing Sentry issue by URL = a link attachment (already supported).

## Data / flow
- `project_integration` provider 'sentry', `secret` = client secret.
- `/api/webhooks/sentry/[integrationId]`: verify `Sentry-Hook-Signature`
  (HMAC-SHA256 hex of the body, timing-safe), `Sentry-Hook-Resource`:
  - `event_alert` (triggered): find a live issue of the
    project with a link attachment to this Sentry issue (`/issues/<id>/`); if
    none, `createIssue(SYSTEM_ACTOR)` in the triage state (when triage is on)
    with title, culprit, link, event count, rule name, then add the link
    attachment (dedupe key). Optional auth token (the internal integration's
    token, encrypted) → short id + event / user counts from `issue_url`.
  - `issue` created is ignored (alert rules decide what becomes an issue).
  - `issue` resolved: every linked issue gets a `sentry.resolved` activity entry
    (actorName "Sentry", summary "resolved the Sentry issue …").
  - `installation` / others: 200.
- Actions: `connectSentry`, `disconnectIntegration`.

## Edge cases
- Concurrent alerts for one Sentry issue may race; a second lookup right
  before insert narrows it (no unique constraint available).
- Unknown integration id / bad signature → identical 401.
- Title capped to TITLE_MAX; description to DESCRIPTION_MAX.
- Deviation: the resolve note is a system activity line (named "Sentry"),
  not a comment — comments need a user author and would render as "Deleted user".
