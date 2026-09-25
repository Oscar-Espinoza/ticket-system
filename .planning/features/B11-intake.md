# B11 — Customer requests / intake form

## Goal
A public form per project that turns outside requests into (triage) issues.

## UX
- `Settings → Intake form` (admin edits): switch "Accept requests" (generates
  `project.intake_token`, off = null), public URL with Copy, "Rotate link" (old link dies),
  embeddable `<iframe>` snippet with Copy. Below: received requests (name, email, body
  excerpt, linked issue key/title/state, time) — latest 50, empty state.
- `/request/[token]` (public, outside /dashboard): project name heading, fields name,
  email, title, description; hidden honeypot (`website`) + signed start time. Success →
  thank-you state with "Submit another". Unknown token → neutral "form not available".

## Data / actions
`src/app/actions/intake.ts`: `setIntakeEnabled`, `rotateIntakeToken` (admin),
`submitIntakeRequest` (public, useActionState). Submission: token → project; honeypot
filled or < 3 s since the HMAC-signed render time → fake success (nothing stored);
≤ 20 requests / project / 10 min; issue created via `createIssue(SYSTEM_ACTOR, …)` in the
first triage state when `triageEnabled`, else the default new-issue state; description
gets a "Submitted by Name <email> via intake form" footer; `customer_request` row stored
with the ticket id.

## Files
`src/app/dashboard/projects/[id]/settings/intake/page.tsx`, `src/app/request/[token]/page.tsx`,
`src/app/actions/intake.ts`, `src/components/integrations/{intake-settings,intake-form}.tsx`.

## Edge cases
Never expose ids, members or states publicly — only the project name. Token rotation 404s
old embeds. Email validated loosely; lengths capped (title 200, description 10 000).
