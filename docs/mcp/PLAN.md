# MCP server: Claude and ChatGPT connectors

Status: phase 1 built (2026-11-12): the `/mcp` endpoint, sign-in (DCR, JWT / opaque /
API-key tokens), every read tool, the three writes, the D8 workspace switch, the settings
section and [docs/MCP.md](../MCP.md), then the MCP Apps views (D7, lane C, branch
`feat/mcp-views`). Not built yet: phase 2. Differences from this plan: "As built" at the end.

## Goal

People at the company add Ticket System as a connector in Claude (claude.ai, Desktop,
mobile, Claude Code) or ChatGPT. They can ask about issues, projects, cycles and their
inbox, see the answers as interactive cards inside the chat, and make safe changes:
create an issue, update its fields, comment. Phase 2 adds ChatGPT-only extras and
MCP Events (ChatGPT starts work when something happens in Ticket System).

## How it works

- **One endpoint.** The app serves an MCP server at `https://<host>/mcp`. Claude and
  ChatGPT send it JSON-RPC over Streamable HTTP: list tools, call a tool, read a resource.
- **Sign-in.** The user pastes the URL into Claude or ChatGPT. The client calls `/mcp`
  and gets a 401 that points to `/.well-known/oauth-protected-resource/mcp`. From
  there it finds our OAuth server (Better Auth, already in the app) and registers
  itself. The user then signs in and approves on our existing `/oauth/consent` page,
  and the client gets a token for `https://<host>/mcp`.
- **UI.** We use MCP Apps, an open standard co-developed by Anthropic and OpenAI that
  Claude and ChatGPT both support. ChatGPT has been fully compatible since
  2026-02-22. It works in four steps:
  1. A tool's metadata points to a `ui://` HTML resource.
  2. The host renders that resource in a sandboxed iframe.
  3. The host passes the tool result into the iframe over `postMessage`.
  4. The view can call our tools back, for example from a "Move to Done" button.

  The same HTML works in both hosts. Claude Code and text-only clients get only the
  text part of the result (see "Text-only clients" under As built).
- **Events (phase 2, ChatGPT only).** ChatGPT calls `events/subscribe` with a callback
  URL. We then POST signed webhooks when matching things happen, such as "an issue
  was assigned to me", and ChatGPT starts a Work chat to handle it.

## Hard requirement: public reachability

claude.ai, Desktop, mobile and ChatGPT reach `/mcp` and the OAuth token and
registration endpoints from the vendors' clouds. Claude's egress range is
`160.79.104.0/21`. These endpoints must therefore be on public HTTPS:

- `/mcp`
- `/.well-known/oauth-*`
- `/api/auth/oauth2/{token,register}`
- `/api/auth/jwks`

Sign-in and consent run in the user's own browser, so a VPN-only login page is fine.
An instance that lives only on the office network works with Claude Code, which
connects from the user's machine, but not with claude.ai or ChatGPT. Options:

- the Vercel deployment;
- a reverse proxy that exposes only the paths above;
- a tunnel (`cloudflared`) for testing.

## What already exists (reuse it)

| Need | Already in the repo |
|---|---|
| OAuth 2.0 server | `@better-auth/oauth-provider` 1.6.33 in `src/lib/auth.ts`. Scopes: `openid profile email offline_access read write`. Issuer is `<origin>/api/auth`. Puts `iss` in authorization responses and advertises `authorization_response_iss_parameter_supported` (ChatGPT's stable redirect needs this). |
| AS metadata (RFC 8414) | `src/routes/[x+2e]well-known/oauth-authorization-server/api/auth/+server.ts`. OIDC discovery is served by the Better Auth catch-all. |
| Consent screen | `src/routes/oauth/consent/*` |
| Revoking access | Settings → OAuth apps lists authorized apps (`src/lib/components/oauth/authorized-apps.svelte`) |
| Bearer auth and scopes | `src/lib/api-auth.ts`: `lc_…` API keys and opaque OAuth tokens become an `ApiCredential`. Also provides `missingScope()`. |
| Service layer | `listProjectIssues` (`src/lib/graphql/issue-list.ts`), `searchIssues` with filter syntax `assignee:me label:bug …` (`src/lib/search.ts`), `getIssueByKey` (`src/lib/tickets.ts`), `createIssue` / `updateIssueFields` (`src/lib/issue-service.ts`), `createCommentAs` / `loadIssueTimeline` (`src/lib/comments.ts`), `getProjectCycles` / `cycleTotals` / `cycleBurndown` (`src/lib/cycles.ts`), `getInbox` (`src/lib/notifications/inbox.ts`), `requireProjectMember` (`src/lib/project-access.ts`), `getUserWorkspaces` (`src/lib/workspace-access.ts`) |
| Serializers | `src/routes/api/v1/_lib/api.ts` (`serializeIssue`, `projectAccess`) |
| Phase 2 delivery | issue events (`src/lib/events.ts`), outgoing webhooks and SSRF guard (`src/lib/integrations/outgoing-webhooks.ts`, `url-guard.ts`), daily cron (`/api/cron/daily`) |

## Decisions (defaults taken; Oscar can override)

**D1. SDK and transport**
- Packages: `@modelcontextprotocol/server@^2.4` and `@modelcontextprotocol/ext-apps@^2.0.4`, plus `zod@^4.2` as a direct dependency (today 4.6.7 is only transitive).
  - The 2.x line uses the same wire protocol as 1.x hosts.
  - `ext-apps` peers `@modelcontextprotocol/core`, `client` and `server` at ^2; React is optional.
- Transport: stateless Streamable HTTP with the web-standard transport.
  - No sessions; JSON responses (`enableJsonResponse`).
  - Built inside a SvelteKit `+server.ts`, with a fresh `McpServer` per request.
  - This runs unchanged on Vercel functions and adapter-node.
- Check the exact v2 export names in `node_modules` before coding. The docs name `WebStandardStreamableHTTPServerTransport`.

**D2. Endpoint**
- `https://<host>/mcp`. This is the exact string users paste.
- The protected-resource `resource` field must equal it byte for byte.

**D3. Client registration: Dynamic Client Registration (DCR)**
Claude and ChatGPT both use DCR, and Better Auth 1.6.33 supports it. Enable `allowDynamicClientRegistration` and `allowUnauthenticatedClientRegistration`, then lock them down:
- **Redirect URI allowlist**, enforced in a Better Auth `hooks.before` on `/oauth2/register`:
  - `https://claude.ai/api/mcp/auth_callback`
  - `https://chatgpt.com/connector_platform_oauth_redirect`
  - `https://chatgpt.com/connector/oauth/{callback_id}`
  - loopback `http://localhost:*` and `http://127.0.0.1:*` (Claude Code, MCP Inspector)
  - anything in `MCP_EXTRA_REDIRECT_URIS`
- **Public clients only**: `token_endpoint_auth_method` must be `none`. Scopes are capped at `openid profile email offline_access read write`. Client names are capped at 100 characters.
- **Rate limit** `/api/auth/oauth2/register` with a Better Auth `rateLimit.customRules` entry.
- **Cleanup**: the daily cron deletes DCR clients that have had no live token for 30 days, with
  their consents (a user's consent doesn't keep a client; they consent again on reconnecting).
- **Consent page**: show the redirect host next to the self-asserted client name, for example "Claude · claude.ai". Flag dynamically registered clients.
- CIMD is what both vendors prefer, but it needs Better Auth 1.7 or later (1.7.18 has `client_id_metadata_document_supported`). That is follow-up F1, not v1.

**D4. Tokens accepted by `/mcp`**
1. **JWT access tokens.** Set `validAudiences: ['<origin>/mcp']`, so clients that send `resource=<origin>/mcp` get a JWT with that audience. MCP clients must send it, and ChatGPT does.
   - Verify with `verifyAccessToken`: issuer, `aud` equal to the MCP URL, expiry, JWKS.
   - Then check that the client isn't disabled and that the user's consent row for that client still exists. This makes revoking in Settings take effect immediately, not after the token's one-hour life.
2. **Opaque OAuth tokens.** Use the existing `api-auth.ts` path, for clients that omit `resource`.
3. **Personal API keys** (`lc_…`), for Claude Code `--header` and other agents.

`/api/v1` keeps rejecting JWTs, which keeps the two audiences separate. Access-token TTL stays one hour. Refresh tokens must rotate, with the new token returned in the same response; Claude requires this for public clients. Verify Better Auth does it, and add a test.

**D5. Scopes**
- `read` gates read tools and `write` gates write tools, as in the REST API.
- Protected-resource metadata advertises `scopes_supported: ['read','write']`. Claude adds `offline_access` because the AS metadata lists it.
- A write tool called with a read-only token returns `isError` with a text explanation and `_meta["mcp/www_authenticate"]` (a `Bearer error="insufficient_scope", error_description=…` challenge). ChatGPT uses that challenge to show its re-link UI.

**D6. v1 scope of writes**
- Allowed: create issue, update issue fields, add comment.
- Not allowed: delete, archive, purge, bulk operations, member, role, settings or integration changes.
- Every write adds an audit entry `mcp.tool_call` with user, client id and name, tool, and issue id (`src/lib/audit.ts`).

**D7. UI build**
- One Svelte 5 single-file bundle (`vite-plugin-singlefile`). The view is picked by `structuredContent.view`.
- The bundle is inlined into the server build with a `?raw` import, so it needs no filesystem access at runtime (Vercel and Docker).
- The resource URI is content-hashed, `ui://ticket-system/app.<hash>.html`, because ChatGPT caches the same URI for up to an hour.
- The view makes no network requests (`connectDomains: []`). All data goes through tool calls, so the token never enters the iframe.
- `resourceDomains: []`: the view loads no image, font or script. Avatars are initials (review round 1 removed the same-origin image path: `user.image` is typed by the user, and the one allowed origin only serves `/api/uploads/*`, which need auth the iframe doesn't have).
- No `ui.domain` in v1. It is only needed for fixed-origin features or a directory listing.

**D8. Workspace admin switch**
- A workspace setting "AI assistant connectors: allowed / blocked", default allowed, with one migration on `workspace`.
- When a workspace blocks connectors, MCP tools act as if its projects don't exist. Enforce this in one shared access helper, not per tool.

**D9. No public directory listing**
- Custom connector only, for internal use.
- Tool annotations and descriptions still follow both vendors' review rules, so a listing stays possible later (F2).

**D10. Phase 2**
- ChatGPT extras and MCP Events come only after phase 1 is in use.

## Tool catalogue (v1)

Rules for every tool:
- **Annotations.** Set `title` and all three hints explicitly; ChatGPT requires them.
  - Read tools: `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.
  - Write tools: `readOnlyHint: false` and `openWorldHint: false`.
  - `destructiveHint` is `false` for additive writes (`create_issue`, `add_comment`) and `true` for `update_issue`, which overwrites fields. Both vendors' rules call for this, so hosts ask for confirmation.
- **Metadata.**
  - `securitySchemes: [{ type: 'oauth2', scopes: [...] }]`, set both top-level and in `_meta.securitySchemes`.
  - `_meta["openai/toolInvocation/invoking"]` and `invoked` status strings, at most 64 characters each.
  - `_meta.ui.resourceUri` when the tool has a view.
- **Descriptions.** No cross-tool steering ("call X first"); both reviews reject it. Shared guidance goes in the server `instructions`, sent at initialize: issue keys look like `WEB-123`; `me` works as an assignee; descriptions are Markdown; valid state and label names come from `get_project_metadata`.
- **Inputs.** Accept human values: a project key (`WEB`) or id; a state name or type; an assignee as `me`, `none`, an email or a name; labels by name. Resolve them server-side (`resolve.ts`). On failure, return an error that lists the valid options.
- **Outputs.**
  - `content`: compact Markdown, for the model and text-only hosts; complete on its own.
  - `structuredContent`: a typed, concise object that the view renders, sent only to hosts that render views. ChatGPT's model also reads it.
  - `_meta`: UI-only extras such as avatar URLs, permalinks and long description text.
  - Lists default to 25 items (maximum 100) and paginate with a cursor. List rows carry truncated descriptions.
  - Keep each result well under about 100k characters. Claude's limit is about 150k characters, and Claude Code's is 25k tokens.
- **Access.** Each call checks project membership and the role, as the REST API does. Never trust ids the model passes.

| Tool | Scope | View | Backed by |
|---|---|---|---|
| `list_projects` | read | project-list | `getUserWorkspaces` and the `GET /api/v1/projects` query |
| `search_issues` | read | issue-list | `searchIssues`: free text plus filter syntax (`assignee:me label:bug priority:high state:started`), optional project |
| `list_issues` | read | issue-list | `listProjectIssues`: project, state, assignee, label, `updated_since`, `include_archived`, `limit`, `cursor`, optional `group_by: state` |
| `my_work` | read | issue-list (grouped) | open issues assigned to me across projects, by priority and then due date |
| `get_issue` | read | issue-detail | `getIssueByKey`, plus the last N comments from `loadIssueTimeline`, sub-issues and relations |
| `get_project_overview` | read | project-overview | counts by state type, active-cycle progress and burndown, recently updated issues |
| `get_cycle` | read | project-overview (cycle mode) | `getProjectCycles` (default: current cycle), `cycleTotals`, `cycleBurndown` |
| `get_project_metadata` | read | none | states, labels, members (name and id), cycles: the ids the model needs before writing |
| `list_inbox` | read | issue-list (notification rows) | `getInbox` |
| `create_issue` | write | issue-detail | `createIssue` |
| `update_issue` | write | issue-detail | `updateIssueFields`: title, description, state, priority, assignee, labels, estimate, due date, cycle, epic |
| `add_comment` | write | issue-detail | `createCommentAs` |

There are no app-only tools in v1. Views call the tools above directly; their
visibility defaults to `["model","app"]`.

## Views (MCP Apps)

`src/mcp-ui/` holds a Svelte 5 + Tailwind 4 app with its own `vite.mcp-ui.config.ts`
and `vite-plugin-singlefile`. It builds to `src/lib/server/mcp/ui/app.html`, which is
generated and gitignored.

1. **issue-list**
   - Each row shows a priority icon, key, title, state chip (in the state's color), assignee avatar or initials, labels and due date. Rows can be grouped by state.
   - "Load more" calls the same tool again with the cursor.
   - Clicking a row expands it inline through `get_issue`.
   - "Open in Ticket System" uses `ui/open-link` to open `<origin>/dashboard/projects/<id>/issues/<key>`.
2. **issue-detail**
   - Header: key, title, state, priority, assignee, labels, cycle, due date.
   - Body: the description as Markdown, through `svelte-exmarkdown` (already a dependency, raw HTML off), plus the last 5 comments.
   - Actions: a state menu, "Assign to me" and a comment box. Each calls `update_issue` or `add_comment` and re-renders from the result.
   - After a write, send `ui/update-model-context` so the model knows what changed.
3. **project-overview** (also cycle mode)
   - State-type counts as a stacked bar, active-cycle progress, and a burndown drawn as inline SVG (no chart library).
   - Also shows the top open issues.
4. **project-list**: cards with key, name and open issue count.

Shared view behavior:
- **Theme.** Follow the host theme (`applyDocumentTheme`, `applyHostStyleVariables`), with the app's tokens as fallbacks for every variable used. Light and dark both work.
- **Layout.** Respect safe-area insets. Use `autoResize`. Declare `availableDisplayModes: ['inline','fullscreen']`; long lists offer fullscreen.
- **States.** Show a skeleton until `tool-result` arrives, and an error state when `isError` is set.
- **Size.** Keep the bundle under about 250 KB raw.

Build wiring:
- `npm run build:mcp-ui` runs from the `predev` and `prebuild` npm hooks.
- The Dockerfile's `npx vite build` step becomes `npm run build`. Vercel already runs `npm run build`.
- Tests mock the `?raw` import.

## Server layout

```
src/lib/server/mcp/
  contracts.ts   # structuredContent types per view + McpCredential; shared with src/mcp-ui (written first)
  auth.ts        # authenticateMcpRequest(req): McpCredential | Response(401/403)
  server.ts      # createMcpServer(credential): tools, ui resource, instructions
  access.ts      # membership + D8 workspace switch, one place
  resolve.ts     # key/name → id with helpful errors
  format.ts      # Markdown text renderers + structured serializers (reuse serializeIssue)
  ui.ts          # registerAppResource: ?raw HTML, MIME text/html;profile=mcp-app, CSP meta, hashed URI
  tools/{projects,issues,cycles,inbox,write}.ts
src/routes/mcp/+server.ts                                    # POST JSON-RPC; GET/DELETE 405; OPTIONS CORS
src/routes/[x+2e]well-known/oauth-protected-resource/+server.ts       # RFC 9728
src/routes/[x+2e]well-known/oauth-protected-resource/mcp/+server.ts   # same document
src/mcp-ui/                                                  # view bundle source
```

Auth and HTTP details:
- **401 response.** `/mcp` answers 401 with
  `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/mcp", scope="read write"`.
- **Protected-resource metadata.**
  `{ resource: '<origin>/mcp', authorization_servers: ['<origin>/api/auth'], scopes_supported: ['read','write'], bearer_methods_supported: ['header'], resource_name: 'Ticket System' }`.
  Serve it with CORS `*`.
- **AS metadata.** Check that it now lists `registration_endpoint`, `code_challenge_methods_supported: ['S256']`, `none` in `token_endpoint_auth_methods_supported`, and `offline_access` in `scopes_supported`. Add `/.well-known/openid-configuration/api/auth` as well, for clients that try OIDC path insertion.
- **CORS on `/mcp`.** Allow origin `*` and the headers `authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id`. Expose `WWW-Authenticate` and `Mcp-Session-Id`. This is safe because `/mcp` never authenticates by cookie, which must stay true: no cookie auth on `/mcp`.
- **`src/hooks.server.ts`.** Add `^/mcp$` to `CSRF_EXEMPT`. Make the compress handle skip `text/event-stream`.
- **Endpoint behavior.** The token endpoint accepts form-urlencoded (Better Auth does). Discovery, register and token must answer within 10 seconds, Claude's limit.

## Security checklist (reviewers check each)

- **Registration.** DCR can only create public clients with allowlisted redirects, and it is rate-limited.
- **Token validation.** The JWT `aud` must equal the MCP URL. Tokens with another audience, opaque tokens from disabled clients, revoked consents, and expired or tampered tokens are all rejected.
- **No cookie auth.** `/mcp` never accepts the session cookie.
- **Tenant isolation.** Every tool re-checks membership. User B can't read, search or write project A, including by guessing ids or keys and through search snippets.
- **Views and XSS.** Views render user content as text or sanitized Markdown, never `{@html}` of raw descriptions. The CSP has no `connectDomains`.
- **Prompt injection.** Issue text is untrusted and arrives in tool results. Writes are limited to D6, `update_issue` is marked destructive so hosts confirm it, and no tool can change access, delete data or reveal secrets.
- **Data minimization.** Members are returned as name and id; emails appear only to tell apart duplicate names. Results carry no session or request ids.
- **Audit.** Every write tool call is audited with its OAuth client.

## Tests (targeted, local Postgres only, never Neon)

- **`src/tests/mcp/auth.test.ts`**
  - The 401 status and header.
  - The protected-resource metadata document.
  - JWT checks: wrong audience, expired, revoked consent.
  - An API key is accepted.
  - A read-only token gets an `insufficient_scope` tool error from a write tool.
  - Refresh-token rotation.
- **`src/tests/mcp/register.test.ts`**: disallowed redirects and confidential clients are rejected; the Claude, ChatGPT and loopback redirects are accepted.
- **`src/tests/local-db/mcp-tools.test.ts`** drives the route handler in-process with `Request` objects (or `@modelcontextprotocol/client`):
  - Handshake and listing: `initialize`, then `tools/list`. Every tool has explicit annotations, a name of at most 64 characters, and a `resourceUri` that resolves.
  - `tools/call` for every tool against seeded data.
  - The two-user tenant-isolation cases.
  - `resources/read` returns `text/html;profile=mcp-app` with the CSP metadata.
- **Manual or E2E checks:**
  - MCP Inspector (`npx @modelcontextprotocol/inspector`) against localhost.
  - Claude Code: `claude mcp add --transport http ticket-system http://localhost:3010/mcp`, once with OAuth (DCR plus a loopback redirect) and once with `--header "Authorization: Bearer lc_…"`.
  - The `ext-apps` `examples/basic-host`, cloned to the scratchpad and not the repo, renders every view. Take Playwright-core screenshots in light and dark, with one browser.
  - Finally, real claude.ai and ChatGPT through a public URL, using Oscar's accounts.
    - Claude: Settings → Connectors → Add custom connector.
    - ChatGPT: chatgpt.com/plugins → + → Add custom MCP server → OAuth.

## Execution (when Oscar says go)

Keep resource use calm: at most 3 agents and at most one browser. Run checks nice'd
through `scripts/kit-check.sh`. Run targeted tests only, against local Postgres on
:5433, and don't run a dev server per agent. Work on main, with no worktrees or
workers. Kill processes by PID.

0. **Coordinator setup.**
   - Create the dashboard (dashboard-builder).
   - Install the dependencies with npm (package-lock).
   - Write `contracts.ts` (view types and `McpCredential`), stub `authenticateMcpRequest` and the tool files.
   - Commit.
1. **Lane A, auth** (sonnet-high: permissions and tenant isolation):
   - D3 to D5 and D8.
   - Protected-resource routes, the register hook and the consent-page tweak.
   - `mcp/auth.ts` and `access.ts`, the hooks tweaks, the cron cleanup and the auth and register tests.
2. **Lane B, tools and route** (sonnet-high: touches permissions):
   - `server.ts`, `tools/*`, `resolve.ts`, `format.ts` and the `/mcp` route.
   - Audit entries and the tool tests.
   - Depends only on the step-0 contracts.
3. **Lane C, views** (sonnet-mid):
   - The `src/mcp-ui` bundle, the build scripts (package.json and Dockerfile) and `ui.ts`.
   - basic-host screenshots in light and dark.
   - Depends only on `contracts.ts`.
4. **Coordinator: settings and docs.**
   - Add a "Connect an AI assistant" section to Settings → OAuth apps: the MCP URL with a copy button, short steps for Claude, ChatGPT and Claude Code, and a pointer to the existing Authorized apps list.
   - Write `docs/MCP.md` (user and admin guide) and add notes to the README and `docs/SELF_HOSTING.md`, including public reachability.
5. **Integration.**
   - MCP Inspector, and the local Claude Code OAuth end-to-end run.
   - svelte-check and eslint, then the targeted tests.
   - A production build and a `node build` smoke test.
6. **Review.** Codex Sol and Astra at xhigh, against the security checklist above. Fix the findings, then have Sol re-check.
7. **Live test.** Oscar connects real claude.ai and ChatGPT through a public URL. Fix what comes up, push to main and clean up the build output.

## Phase 2: ChatGPT extras and MCP Events (later)

**MCP Events.**
- *Protocol.* Add `events/list`, `events/subscribe`, `events/unsubscribe` and the `events: {}` capability. The official TypeScript SDK doesn't support MCP Events yet, so handle these JSON-RPC methods in the `/mcp` route before the transport, or register custom request handlers.
- *Event types:*
  - `issue.assigned_to_me`
  - `issue.mentioned_me`
  - `issue.created` (project, optional label filter)
  - `issue.state_changed` (project or one issue)
  - `comment.created` (issues I'm subscribed to)
- *Storage.* A new `mcp_event_subscription` table: user, OAuth client, name, arguments (jsonb), callback URL, secret (encrypted at rest), cursor, `refresh_before` and expiry.
- *Delivery.* Hook into `publishIssueEvents`, through the outgoing-webhook infrastructure and `url-guard`: HTTPS only, no redirects, no private IPs.
  - Sign with Standard Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature`, plus `X-MCP-Subscription-Id`.
  - One event per POST, each at most 256 KiB.
  - Don't retry on 410 or 413.
- *Subscription lifecycle.*
  - The `whsec_` secret must decode to 24–64 bytes.
  - Run the verification challenge on subscribe, and return `refreshBefore`. ChatGPT renews by subscribing again.
  - Re-check project access at delivery time.
- *Availability.* Only in ChatGPT Work chats (business workspaces), on web and in the desktop app with Cloud selected.

**ChatGPT-only view extras**, behind feature detection (`window.openai`):
- `setOpenInAppUrl`: the "open in app" button in fullscreen.
- `requestModal`: a create-issue form.
- `widgetState`: remember expanded rows and filters.
- `openai/widgetCSP.redirect_domains: [origin]`, so `openExternal` can open the app.

**Per-host `_meta.ui.domain`**, only if a view ever needs a fixed origin. Claude's value is the first 32 hex characters of sha256 of the connector URL, plus `.claudemcpcontent.com`. ChatGPT's must be unique per plugin.

## Follow-ups (not scheduled)

- **F1.** Upgrade Better Auth from 1.6.33 to 1.7.x, all packages together, for CIMD, which both vendors prefer. This stops one OAuth client being created per connection. Re-run the auth tests.
- **F2.** Directory listings. Claude needs a privacy policy, a docs URL, a demo account without MFA, and 3–5 PNG screenshots. ChatGPT needs domain verification at `/.well-known/openai-apps-challenge`, 5 positive and 3 negative test prompts, and a demo video.
- **F3.** More tools: documents, initiatives, epics, customers, insights, and bulk updates with a confirmation view.
- **F4.** Show MCP usage per client in the audit-log UI.

## Open questions for Oscar (defaults in brackets)

1. Which public URL will the connector use? [The Vercel production URL; a tunnel for testing]
2. Should v1 allow writes? [Yes: create, update fields, comment. No deletes]
3. Should workspace admins be able to block AI connectors? [Yes, allowed by default]
4. Should it be listed in the Claude or ChatGPT public directories? [No: custom connector only]
5. Phase 2 events need ChatGPT Business or Enterprise (Work chats). Does the company have it? [Assume yes; build after phase 1]

## Sources (read 2026-11-05)

- Claude connectors: authentication <https://claude.com/docs/connectors/building/authentication>; MCP Apps <https://claude.com/docs/connectors/building/mcp-apps/getting-started>; limits <https://claude.com/docs/connectors/building/index>; review criteria <https://claude.com/docs/connectors/building/review-criteria>
- MCP Apps spec (stable 2026-01-26) <https://github.com/modelcontextprotocol/ext-apps>; docs <https://modelcontextprotocol.io/docs/extensions/apps>; API <https://apps.extensions.modelcontextprotocol.io/api/>
- ChatGPT (Apps renamed to Plugins): MCP server <https://developers.openai.com/plugins/build/mcp-server>; UI <https://developers.openai.com/plugins/build/chatgpt-ui>; auth <https://developers.openai.com/plugins/build/auth>; MCP Events <https://developers.openai.com/plugins/build/mcp-events>; reference <https://developers.openai.com/plugins/reference>; changelog <https://developers.openai.com/plugins/changelog>

## As built (phase 1, 2026-11-12)

Checked against the installed packages; where they differ from the plan, the
plan's intent was kept with what exists.

- **Execution.** Built in one worktree/branch with a PR, not on main with
  lanes (Oscar's later instruction). Lane C (views) is out of this PR: no
  `src/mcp-ui`, `ui.ts`, `@modelcontextprotocol/ext-apps` or `ui://` resource,
  and no tool sets `_meta.ui.resourceUri` (nothing points at a resource that
  doesn't exist). `contracts.ts` exists and every tool already returns
  `structuredContent` with a `view` field, so the follow-up only adds the
  bundle, the resource and the `resourceUri`s. One extra contract,
  `project-metadata`, has no planned view.
- **SDK (D1).** `@modelcontextprotocol/server@2.4.0` is real (v2 stable line,
  spec 2026-07-28, successor of `@modelcontextprotocol/sdk` 1.x); `zod@^4.2` is
  a direct dependency (resolves to 4.6.7, shared with Better Auth). It has
  `WebStandardStreamableHTTPServerTransport` and also `createMcpHandler`, a
  per-request entry for 2026-07-28 requests whose 2025 fallback answers over
  SSE. `/mcp` routes with the SDK's `isLegacyRequest`: 2025-era requests (what
  Claude, ChatGPT and Claude Code send today) get a fresh `McpServer` on the
  web-standard transport (`sessionIdGenerator: undefined`,
  `enableJsonResponse: true`); 2026-07-28 requests go to
  `createMcpHandler(…, { legacy: 'reject' })`. Both build the server per
  request from the authenticated credential (`src/lib/server/mcp/http.ts`).
- **Tool metadata.** `registerTool` has no top-level `securitySchemes` and the
  SDK's `tools/list` emits a fixed field set, so `securitySchemes` is only in
  `_meta.securitySchemes` (ChatGPT reads either). The SDK's `scopeChallenge`
  (an HTTP 403 step-up) is not used: D5's tool error with
  `_meta["mcp/www_authenticate"]` (an array with one challenge string) is.
- **Better Auth 1.6.33 (not upgraded).** `allowDynamicClientRegistration`,
  `allowUnauthenticatedClientRegistration` and `validAudiences` exist and behave
  as planned (`validAudiences` replaces the default `<origin>/api/auth`; with
  `openid` the JWT `aud` is an array that also holds the userinfo URL).
  - `verifyAccessToken` (from `better-auth/oauth2`) fetches the JWKS over HTTP;
    `/mcp` uses its building block `verifyJwsAccessToken` with
    `jwksFetch: () => auth.api.getJwks()` (in-process, cached five minutes),
    issuer `<origin>/api/auth` and audience `<origin>/mcp`, then re-checks the
    client (not disabled) and the consent row; granted scopes are the token's
    scopes intersected with the consent's. Session JWTs from the jwt plugin's
    `/api/auth/token` (issuer and audience = origin) are rejected.
  - Rate limit: no `rateLimit.customRules` needed; the oauth-provider plugin
    has its own `rateLimit.register` rule, set explicitly to 5 per 60 s. Better
    Auth enforces rate limits only with `NODE_ENV=production` (Docker and
    Vercel set it; verified: the 6th registration in a minute gets 429) and
    stores counters in memory, i.e. per process / per Vercel instance.
    Review round 1: Better Auth keys the counter by
    `advanced.ipAddress.ipAddressHeaders` (default `x-forwarded-for`, trusted
    when it holds one address, i.e. spoofable on a directly exposed Node
    server). It now reads `x-ticket-system-client-ip`, which
    `src/hooks.server.ts` overwrites on every `/api/auth` request with
    SvelteKit's `getClientAddress()` (socket peer; `ADDRESS_HEADER` /
    `XFF_DEPTH` behind a proxy; Vercel's `x-forwarded-for` on Vercel). No
    resolvable address → Better Auth's single shared bucket.
  - `hooks.before` on `/oauth2/register` works and runs the policy in
    `src/lib/server/mcp/register.ts`. The endpoint's body schema drops unknown
    fields, so the "dynamic" mark is written by `hooks.after`
    (`oauth_client.metadata = {"registration":"dynamic"}`). Unauthenticated DCR
    in Better Auth silently turns confidential requests into public ones; the
    hook rejects an explicit confidential method instead, and also covers
    cookie-authenticated registrations (which Better Auth would otherwise
    allow to be confidential). `skip_consent` can't be set through DCR.
  - Review round 1 (stored XSS): `client_uri`, `logo_uri`, `tos_uri` and
    `policy_uri` must be absolute `https:` URLs or absent (`invalidClientUri`
    in `src/lib/oauth-model.ts`, the one rule for DCR, the Settings action and
    a `hooks.before` on Better Auth's create/update-client endpoints, which
    `auth.api` calls also pass through); `post_logout_redirect_uris` is refused
    on DCR; `/oauth2/create-client` and `/oauth2/update-client` are in
    `disabledPaths` (Settings uses `auth.api`). Rendering goes through
    `safeHref` (links and logos), and the Settings data is sanitized in its
    load. Redirect URIs must be canonical (`new URL(uri).href === uri`) before
    any allowlist pattern runs. Real Claude / ChatGPT registration payloads
    aren't documented in the sources; they send https values or none.
  - Cleanup (review round 1): the daily job also deletes dynamic clients
    registered more than a day ago with no consent and no token at all; the
    30-day rule for used ones is unchanged. Settings-created clients are never
    touched.
  - AS metadata lists `client_secret_basic`/`client_secret_post` besides `none`
    (Settings-created apps are confidential); DCR stays public-only.
  - Over `fetch` (which sends `sec-fetch-mode: cors`), `/oauth2/authorize`
    answers `{redirect, url}` JSON; a browser navigation gets the 302.
- **Tools.** The issue listing lives in `src/lib/issue-list.ts`. `searchIssues`
  returns at most 50 matches with no cursor, so `search_issues` has `limit`
  only (`nextCursor` always null), and takes the reachable project ids
  (membership + D8, from `access.ts`) as a filter so blocked projects can't
  fill those 50 slots; `my_work` and `list_inbox` page with an
  opaque offset cursor. `listIssueRelations` already stays inside the issue's
  project, so issue detail needs no extra relation filter. `list_inbox` drops
  notifications without a project (the weekly pulse can summarize blocked
  workspaces).
- **Audit.** `mcp.tool_call` rows go on the issue's project (category
  Integrations) with `ticketId` null, so they don't appear in the issue's own
  timeline; `data` holds tool, client id/name, `via` and the issue id/key.
  The row is written after the service's own batch commits (the services take
  no extra rows, and update audits only when the diff is non-empty); a failed
  audit insert is logged and the tool still returns its result, so a model
  retry can't duplicate the write. `create_issue` takes an optional
  `request_id` (the issue service's client-chosen id): a retry returns the same
  issue and isn't audited twice.
- **Protocol.** `/mcp` reads the body once (1 MiB cap) and refuses JSON-RPC
  batches (arrays) with HTTP 400 / -32600: batching left the protocol in
  2025-06-18 and Claude, ChatGPT and Claude Code don't send it (the SDK would
  otherwise accept up to 100 messages). Text results put descriptions and
  comment bodies in fenced `user-content` blocks longer than any backtick run
  inside; `structuredContent` is unchanged.
- **Config.** The resource (`<app URL>/mcp`) and the advertised authorization
  server (`<app URL>/api/auth`) come from `appUrl()`; `mcpConfig()` in
  `urls.ts` compares the latter with Better Auth's base URL (`authBaseUrl()`,
  moved from `sso.ts` to `app-url.ts`) and, when they differ, logs once and
  `/mcp` plus the protected-resource documents answer 500 naming both.
- **D8.** Migration `0010_mcp_connectors`: `workspace.ai_connectors_allowed
  boolean not null default true`; the switch is in Workspace → Security
  (`setAiConnectorsAllowed`, audited as `security.ai_connectors_allowed` /
  `security.ai_connectors_blocked`).
- **Tests.** `src/tests/mcp/{auth,register}.test.ts` and
  `src/tests/local-db/mcp-tools.test.ts` need the local Postgres
  (`LOCAL_DB_TESTS=1`); the auth test runs the whole DCR → PKCE (`resource`) →
  consent → token → refresh flow through `auth.handler` in-process.

### Hardening (2026-11-12, branch `feat/mcp-hardening`)

Closes the open notes of PR #4's focused re-review and its follow-up list.

- **Waiting on, follow-up.** `create_issue` / `update_issue` take `waiting_on`
  (resolved by `resolveAssignee`: `me`, `none`, a member's name, email or id
  inside the authorized project) and `follow_up` (`YYYY-MM-DD` or null).
  `IssueSummary` (so every list row and `IssueDetail`) gains `waitingOn:
  UserRef | null` and `followUp: string | null`; no other contract changed.
  `list_issues` filters `waiting_on` and `follow_up` through
  `listProjectIssues` (the REST code, `searchFollowUp` parser). List lines
  show "waiting on X" and "follow up D" / "follow-up due D" (server date),
  which is how `my_work` shows a due follow-up.
- **DCR cleanup** deletes in statements of 200 clients, at most 10 per run;
  migration `0012_oauth_client_indexes` indexes `client_id` on
  `oauth_access_token`, `oauth_refresh_token` and `oauth_consent` (none had one;
  the cascades scanned).
- **Config.** `mcpConfig()` compares `<app URL>/api/auth` with Better Auth's
  base URL after normalising (`URL.origin` + path without trailing slash), so
  letter case or `:443` is no longer a mismatch. The advertised authorization
  server and the issuer `/mcp` accepts are both Better Auth's base URL as
  Better Auth holds it at runtime (`tokenIssuer()`, the `iss` of its tokens),
  not a re-derivation; for a canonical URL it is byte-identical to before.
  Better Auth itself doesn't normalise consistently (its OAuth metadata
  upgrades http→https for non-loopback hosts; tokens keep the raw URL), so
  self-hosted instances must use a canonical URL (docs/SELF_HOSTING.md;
  review round 1). A mismatch answers
  a generic 500; the two URLs are logged once per configuration.
- **`request_id` race.** `createIssue` returns `replayed: true` when the client
  id was already used (before the insert or after losing the unique race);
  `create_issue` audits only the creating call. A replay changes nothing, so a
  second row would read as a second create.
- **Inert text.** `userContentInline` (format.ts) puts titles, people's names,
  search snippets and notification lines on one line, inside a code span longer
  than any backtick run when they contain Markdown; plain text is unchanged.
  List excerpts appear only in `structuredContent`, never in text, so they
  needed nothing. (Since "Text-only clients" below, project descriptions,
  label, state, cycle, epic and project names are inert in text too.)
- **Audit of refused writes** (`src/lib/server/mcp/audit.ts`): every write-tool
  call leaves one `mcp.tool_call` row with `data.outcome` = `success`,
  `denied` (`insufficient_scope`, `forbidden_role`, `connectors_blocked`,
  `not_found`), `invalid` (`invalid_input`) or `failed` (`server_error`),
  written by `registerMcpTool` for refusals. No issue content. A refusal is
  written only into a project the caller is a member of (membership is part of
  the target lookup, so existing and missing keys cost the same queries);
  outsiders' attempts get a server log line only (review round 1); schema
  validation failures happen in the SDK before the tool and aren't audited.
- **Rate limit.** `/mcp` allows `MCP_RATE_LIMIT_PER_MINUTE` (default 120, 0 =
  off) calls per credential (user + OAuth client, or user + API key) with an
  in-memory token bucket (`src/lib/server/rate-limit.ts`; the app had none to
  reuse); over it, HTTP 429 + `Retry-After` + JSON-RPC -32000. Per instance.
- **Proxy warning.** `src/hooks.server.ts` logs one warning when an
  `/api/auth` request resolves to a private or loopback address and
  `ADDRESS_HEADER` is unset (not in dev or on Vercel).
- **Loopback redirects** may leave out the path (`http://localhost:1234`); the
  exception applies to the loopback rule only.
- Still open: database-backed limiters, the audit row inside the write's
  transaction, client logo hosts / CSP (MCP Apps views: built, see below).


### Views (2026-11-12, branch `feat/mcp-views`)

Lane C: `src/mcp-ui` (Svelte 5 + Tailwind 4), `vite.mcp-ui.config.ts`,
`src/lib/server/mcp/ui.ts`, the `resourceUri` on eleven tools. Checked against the
installed packages; where they differ from the plan, the plan's intent was kept.

- **Packages.** `@modelcontextprotocol/ext-apps@2.0.4` exists as planned (peers
  `core|client|server` ^2, React optional) and `vite-plugin-singlefile@2.3.4`
  supports the installed Vite 8.0.16 (rolldown). The server uses ext-apps'
  `/server` entry (`registerAppResource`, `RESOURCE_MIME_TYPE`,
  `RESOURCE_URI_META_KEY`; a few hundred bytes). The view does **not** import
  its `App` class: `App` pulls the MCP client, core and zod into the page
  (~290 KB for an empty view, over the whole budget; the package's own
  `app-with-deps` build is 540 KB, and the bundler can't tree-shake it).
  `src/mcp-ui/lib/host.ts` is a small JSON-RPC-over-postMessage client for the
  same protocol (spec 2026-01-26): `ui/initialize`, `ui/notifications/{initialized,
  tool-result,tool-cancelled,host-context-changed,size-changed}`, `tools/call`,
  `ui/open-link`, `ui/update-model-context`, `ui/request-display-mode`,
  `ui/resource-teardown` and `ping`, auto-resize with a `ResizeObserver`, and
  `availableDisplayModes: ['inline','fullscreen']`. It was exercised against the
  SDK's own `AppBridge` as host (see Tests). `src/mcp-ui/lib/theme.ts`
  reimplements `applyDocumentTheme` / `applyHostStyleVariables` / `applyHostFonts`
  (host variable names are limited to `--color|font|border|shadow-*`) and adds
  safe-area insets.
- **Tool metadata.** `registerAppTool` isn't used: `registerMcpTool` sets
  `_meta.ui.resourceUri` and the legacy `_meta["ui/resourceUri"]` itself (what
  `registerAppTool` does) for tools declared with `view: true`: all but
  `get_project_metadata`. `visibility` stays the default `["model","app"]`: the
  view calls `get_issue`, `get_project_metadata`, `update_issue`, `add_comment` and
  the list tools itself.
- **Resource.** One resource, `ui://ticket-system/app.<first 12 hex of sha256 of
  the HTML>.html`, MIME `text/html;profile=mcp-app`, from a `?raw` import. CSP in
  the content item and the `resources/list` entry: `connectDomains: []`
  (explicit), `resourceDomains: []` (explicit), `prefersBorder: true`; no
  `frameDomains`, no `ui.domain`. Avatars: none; the view draws initials and
  `UserRef` is `{ id, name }` (`userRef` in `format.ts`).
- **Contract additions** (`contracts.ts`): `PageSource` /
  `source` on the list and inbox views, the tool and arguments (without `cursor`)
  that produced the page. The view repeats them with `cursor` for "Load more"
  instead of relying on the host's `toolInfo`. Text results are unchanged.
- **Build.** `npm run build:mcp-ui` = `svelte-kit sync && vite build -c
  vite.mcp-ui.config.ts` (the sync is needed: the Vite transform of
  `src/lib/dates.ts` / `issue-model.ts`, which the view imports as the owners of
  the date, state-type and priority rules, reads the root `tsconfig.json`, which
  extends `$app/tsconfig`, present only after a sync). `predev`, `predev:local`
  and `prebuild` run it; the Dockerfile's `npx vite build` is now `npm run
  build`. `build.modulePreload` is off (its polyfill is a `fetch` call).
  Output ~261 KB raw, ~85 KB gzip (after review round 1).
- **Fresh clone.** Instead of mocking the `?raw` import, `vite.config.ts` has a
  plugin that resolves `./ui/app.html?raw` to a placeholder page when the
  generated file is missing (tests, `vite dev`) and fails `vite build` with "run
  `npm run build:mcp-ui`". `npm run check` needs nothing (the `?raw` types come
  from vite/client), `npm run lint` ignores it, CI's build step produces the file
  before the tests run. The bundle scan test runs only when the file exists.
- **Markdown.** `svelte-exmarkdown`. Raw HTML in the source shows as literal
  text (`remarkLiteralHtml`: inline → text, block → code block); `rehypeSafe`
  drops any `raw` node, URL attribute that isn't `http(s)`, `on*` and `style`.
  Links are `<button class="link-text">` that call `ui/open-link` (no `href`, so
  middle-click and the context menu can't navigate); `mailto:` is plain text,
  one rule (`safeHref`) shared with `Host.openLink`. Images render as
  `[image: alt]`. GitHub-flavoured Markdown is a
  subset (`lib/gfm-lite.ts`: tables, strikethrough, task lists, built from the
  `micromark-extension-gfm-*` / `mdast-util-gfm-*` packages `remark-gfm` bundles,
  now direct devDependencies): without bare-URL autolinks and footnotes, which
  cost 32 KB. The Markdown stack (unified, micromark, character entities,
  mdast-to-hast) is ~140 KB of the bundle; the rest (Svelte runtime, views,
  Tailwind CSS) ~115 KB.
- **Views.** `issue-list` (also the inbox: `InboxView` carries `notifications`,
  whose rows with an issue expand inline too), `issue-detail`,
  `project-overview` (also cycle mode) and `project-list`, chosen by
  `structuredContent.view`; `project-metadata` and results without a view show
  the result text. State changes load the project's states through
  `get_project_metadata` (cached per project). "Assign to me" is always offered
  (the view doesn't know the viewer's id) plus "Unassign". Rows grouped by state
  leave out the per-row state chip. The full-screen button shows when the host
  lists `fullscreen` and the list has more than 6 rows.
- **Tests.** `src/tests/local-db/mcp-tools.test.ts` (tools carry the same
  `resourceUri`, `resources/list` and `resources/read`, CSP, hash, `source`,
  same-origin avatars); `src/tests/mcp-ui-model.test.ts` (grouping, colours,
  dates, burndown geometry, Markdown link rules, and a scan that keeps the view's
  sources and the built bundle free of fetch / XHR / WebSocket / `{@html}` /
  `innerHTML`). Rendered for real with the SDK's `AppBridge` as host against a
  local server (screenshots in the PR description); claude.ai and ChatGPT need a
  public URL and an account, so those renderings are still for Oscar to check
  (docs/MCP.md, "Testing it for real").

### Review round 1 (2026-11-12)

- Writes: `add_comment` takes `request_id` (the comment's id; same user and
  issue replays, anything else is "already in use"); the issue view sends one
  per draft. A write the host never answers (60 s) is "unconfirmed": the view
  reads the issue (`get_issue`) and looks for the comment id or the new value
  before it allows another send (`lib/write.svelte.ts`). A committed write
  whose details could not be loaded (success, text only) is shown as saved.
- Message client: unknown host requests get -32601, malformed notifications are
  ignored, controls that call tools are hidden when `serverTools` is missing,
  `ui/update-model-context` carries a running summary of the changes.
- `@modelcontextprotocol/ext-apps` is a devDependency: the server copies its two
  constants and the `registerResource` call (a test checks them against it).
- The issue-detail card has no activity timeline (the contract carries comments
  only), so the "activity in another project" entry from `redactActivityFor`
  never reaches it.

### Text-only clients (2026-11-13, branch `fix/mcp-text-clients`)

- Claude Code (2.1.323, checked against a logging stub) hands the model
  `structuredContent` as JSON whenever a result has it and ignores `content`;
  with no `structuredContent` it passes the text, also for a tool that
  declares an `outputSchema` (no error). Ours declare none.
- One rule, `resultFor` in `src/lib/server/mcp/ui.ts`, applied in
  `registerMcpTool` (tools/common.ts) to every successful result: keep
  `structuredContent` when the credential's OAuth client is a view host
  (`credential.viewHost`: all its redirect URIs are the claude.ai or ChatGPT
  callbacks or in `MCP_VIEW_REDIRECT_URIS`; `rendersViews` in register.ts,
  computed in auth.ts) or the request declares the
  `io.modelcontextprotocol/ui` extension with our MIME type (2026-07-28
  requests carry client capabilities in `_meta`; the SDK seeds
  `getClientCapabilities()` from it). Otherwise drop it. API keys, loopback
  clients and unknown clients get text.
- Not used: remembering what a 2025-era client declared at `initialize`
  (stateless server, several instances on Vercel: a flag in memory would
  give the same client different shapes; a DB write per initialize for a
  hint), and User-Agent (spoofable). A declaration can add cards, never
  remove them from claude.ai or ChatGPT.
- Text filled to stand alone: issue rows carry their URL; get_issue shows
  creator, created and updated dates and each comment's id (add_comment's
  `reply_to`) and parent; list_projects shows the description and URL;
  get_project_metadata shows member roles and cycle dates; inbox rows not
  about an issue show their link. Label, state, cycle, epic, project and
  workspace names go through `userContentInline`.

### Cards after a chat reload (2026-11-13, branch `fix/mcp-card-refresh`)

- **Refresh.** Hosts re-render a card from the original tool result, so state
  changed since is gone. After the host delivers the result, the card shows it and
  then re-reads once (`lib/refresh.ts` decides, `lib/app.svelte.ts` schedules):
  `get_issue` for every issue result (also those of `create_issue`,
  `update_issue`, `add_comment`; a write is never repeated), the paged list's
  own `source` (`list_issues`, `my_work`, `list_inbox`; arguments are the
  caller's, cursor dropped), `get_project_overview` or `get_cycle {cycle: id}` for
  an overview, `list_projects`. Search results carry no `source`, so they are not
  refreshed. Only read tools are on the list the view may call.
- **When.** Once per delivered result (a re-sent identical result is ignored), only
  with `hostCapabilities.serverTools`, when the card scrolls into view
  (`IntersectionObserver`), after a random 0–1.5 s so a page of cards does not
  call at once. Not while a comment draft, a write in flight or extra pages exist,
  and a read that was started before such a thing is dropped.
- **Answer.** Unchanged: nothing. Newer: replaced, with "Updated to the latest."
  for 5 s. A tool refusal "…not found" (gone or no access): "No longer
  available" with the server's message. Anything else: the first result stays and
  a discreet note says the check failed.
- **Load more.** The button has a spinner, `aria-busy` and "Loading more…". The
  ~5 s seen in claude.ai was not reproducible here (cold call 0.16 s, warm 10 ms on
  a local server): what is left is the host relay and, in production, a cold
  function and database; the view had only a dimmed label as feedback.
- **Accessibility and narrow widths.** A row's name is one sentence
  (`issueRowLabel`: key, title, state, priority, assignee, labels, due, waiting on,
  separated by commas); the list title, parent, sub-issue, relation and
  project-card titles wrap to two lines instead of one; an expanded row shows its
  full title.
