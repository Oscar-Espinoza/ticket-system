# A2 — Route stubs

## Goal
Every Wave B route exists before Wave B starts, so navigation, tabs, palette and
breadcrumbs can link to them and each owner only replaces a page body.

## Shape
`src/components/coming-soon.tsx` → `ComingSoon({ title, description? })`
(server-safe, wraps `EmptyState`). Each stub `page.tsx`: first line
`// Stub — owned by <agent>`, a static `metadata` title, renders `<ComingSoon />`.
Dynamic params stay unread (owners add `params: Promise<…>` when they need them).
Project-scoped stubs sit under A1's `[id]/layout.tsx`, which already guards
membership.

## Routes
| Route | Owner |
|---|---|
| /dashboard/inbox | B2 |
| /dashboard/my-issues | B6 |
| /dashboard/search | B6 |
| /dashboard/views, /dashboard/views/[viewId] | B6 |
| /dashboard/drafts | B10 |
| /dashboard/settings/notifications | B2 |
| /dashboard/settings/api-keys | B11 |
| /dashboard/workspaces/[slug] | B9 |
| /dashboard/workspaces/[slug]/initiatives, …/[initiativeId] | B8 |
| /dashboard/people/[userId] | B9 |
| /dashboard/projects/[id]/issues/[key] | B6 |
| …/[id]/triage | B7 |
| …/[id]/cycles, …/cycles/[cycleId] | B7 |
| …/[id]/epics, …/epics/[epicId] | B8 |
| …/[id]/roadmap | B8 |
| …/[id]/views | B6 |
| …/[id]/insights | B12 |
| …/[id]/archive, …/[id]/trash | B6 |
| …/[id]/settings/workflow, labels | B9 |
| …/[id]/settings/templates | B10 |
| …/[id]/settings/planning, automations | B7 |
| …/[id]/settings/github | B3 |
| …/[id]/settings/integrations, intake | B11 |
| …/[id]/settings/import-export | B12 |

## Edge cases
Workspace/people stubs don't validate the slug/user yet — owners add
`notFound()` checks along with real data.
