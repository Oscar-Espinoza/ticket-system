---
status: partial
phase: 02-projects-authorization-layer
source: [02-VERIFICATION.md]
started: 2026-06-01T00:00:00Z
updated: 2026-06-01T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Create-project end-to-end
expected: Submitting the create-project dialog with a name and ticket key creates the project, auto-closes the dialog on success, and the new project card appears on the dashboard.
result: [pending]

### 2. Ticket-key auto-transform
expected: Typing into the ticket-key field live-transforms input to uppercase letters only, capped at 6 characters (e.g. "app2!" → "APP").
result: [pending]

### 3. Non-member 404 HTTP round-trip
expected: Visiting /dashboard/projects/[id] for a project you do not belong to returns an HTTP 404 (enumeration-resistant) with no project data leaked.
result: [pending]

### 4. Owner/member badge visual distinction
expected: GitHub-connected and project ownership/role badges render with the correct visual variants (secondary vs outline) and are visually distinguishable.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
