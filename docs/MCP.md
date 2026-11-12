# AI assistants (MCP server)

Ticket System serves a [Model Context Protocol](https://modelcontextprotocol.io)
server at **`https://<your host>/mcp`**. Claude (claude.ai, Desktop, mobile,
Claude Code), ChatGPT and other MCP clients connect to it and can read your
issues and, with your permission, create issues, change their fields and
comment, as you. Design and decisions: [docs/mcp/PLAN.md](mcp/PLAN.md).

The URL to paste is shown, with a copy button, in **Settings → OAuth apps →
Connect an AI assistant**.

## What an assistant can do

| Tool | Needs | What it does |
|---|---|---|
| `list_projects` | read | Projects you can reach, with key and open issue count |
| `search_issues` | read | Full-text search with filters (`assignee:me waiting:me followup:overdue label:bug priority:high state:started is:open`) |
| `list_issues` | read | One project's issues: state, assignee, waiting on, follow-up date, label, updated since, paging, group by state |
| `my_work` | read | Your open issues across projects, most urgent first |
| `get_issue` | read | One issue with recent comments, sub-issues and relations |
| `get_project_overview` | read | Counts by state, current cycle progress and burndown, recent issues |
| `get_cycle` | read | A cycle's scope, progress, burndown and open issues |
| `get_project_metadata` | read | Valid states, labels, members, cycles and epics |
| `list_inbox` | read | Your notifications |
| `create_issue` | write | Create an issue |
| `update_issue` | write | Change title, description, state, priority, assignee, waiting on, labels, estimate, due date, follow-up date, cycle, epic |
| `add_comment` | write | Comment on an issue |

Nothing else: no deleting, archiving, moving, bulk edits, members, roles,
settings or integrations. Every write is recorded in the audit log as
`mcp.tool_call` with the assistant's name (workspace or team → Audit log,
category Integrations), and so is every refused or failed write attempt, e.g.
"tried to update WEB-12 through Claude (MCP), denied: their role has no write
access". `data.outcome` is `success`, `denied` (no write permission on the
connection, a role without write access, not a member of the team, AI
connectors blocked), `invalid` (input that didn't resolve or that the issue
service refused) or `failed` (server error), with a `reason` code. The rows hold
the tool, the client and the issue key, never the issue content the call sent.
An attempt at a team or issue that doesn't exist has nowhere to be recorded.
Inputs that don't match a tool's schema are refused by the MCP library before
the tool runs and aren't audited. The assistant acts with your own permissions: it sees
only projects you are a member of, and a guest can still only read and comment.

**Waiting on and follow-up.** `create_issue` and `update_issue` take
`waiting_on` (`me`, `none`, or a member's name, email or id, like `assignee`;
someone outside the project is refused with the list of members) and
`follow_up` (`YYYY-MM-DD`, `null` clears it). Issues in every result carry
`waitingOn` and `followUp`; list lines show "waiting on Grace" and "follow up
2026-11-20", or "follow-up due 2026-11-10" once the date has arrived (server
date), which is how `my_work` shows follow-ups that are due. `list_issues`
filters with `waiting_on` (same values) and `follow_up` (`overdue`, `today`,
`week`, `next-week`, `none`, or a date with `<`, `<=`, `>`, `>=`), the same
values and code as REST `GET /api/v1/projects/:id/issues` ([API.md](API.md)).

Hosts ask before `update_issue` runs (it is marked as overwriting data).
`create_issue` takes an optional `request_id` (a UUID the assistant picks): a
retry with the same one returns the issue already created instead of a second
copy, and only the call that created it is audited (also when two calls with
the same id race: the issue service reports which one replayed). If the audit row can't be written after a successful change, the change
stands and the failure is logged (an error would make the assistant retry and
duplicate it).

Issue text is written by people and may contain instructions; the server tells
the model to treat it as data, text results put descriptions and comment
bodies in fenced `user-content` blocks the text can't close, and titles,
people's names, search snippets and notification lines on one line, inside an
inline code span when they contain Markdown (plain text is left as it is, to
keep lists compact; `structuredContent` is never altered), and the write
limits above apply regardless. One JSON-RPC message per request: batches
(arrays) are refused with HTTP 400.

## Connect

### Claude (claude.ai, Desktop, mobile)

1. Settings → Connectors → **Add custom connector**.
2. Name it "Ticket System" and paste `https://<your host>/mcp`.
3. Click **Connect**. A Ticket System window opens: sign in, check that the
   consent screen says **Claude · claude.ai**, and click Allow.

On a Team or Enterprise plan an owner adds the connector once in the
organization settings; each person then connects their own account.

### ChatGPT

1. Open chatgpt.com/plugins → **+** → **Add custom MCP server** (developer
   mode must be on for your account or workspace).
2. Paste `https://<your host>/mcp` and choose **OAuth**.
3. Sign in and allow access; the consent screen says **… · chatgpt.com**.

### Claude Code

With OAuth (a browser opens for sign-in; run `/mcp` inside Claude Code if it
doesn't):

```bash
claude mcp add --transport http ticket-system https://<your host>/mcp
```

With a personal API key (Settings → API keys), for headless agents:

```bash
claude mcp add --transport http ticket-system https://<your host>/mcp \
  --header "Authorization: Bearer lc_…"
```

Add `--scope project` to share the server entry with your team through
`.mcp.json` (with OAuth, not a key: a key in `.mcp.json` would be shared too).

### Other clients

Any MCP client with Streamable HTTP and OAuth 2.1 (dynamic client registration,
PKCE) works, e.g. MCP Inspector (`npx @modelcontextprotocol/inspector`). Clients
without OAuth can send an API key as `Authorization: Bearer lc_…`.

## Revoke

Settings → OAuth apps → **Authorized apps** lists every assistant you
connected. Revoking takes effect on the assistant's next call. Deleting an API
key (Settings → API keys) stops agents using it.

## For admins

**Block a workspace.** Workspace → Security → **AI assistant connectors:
allowed / blocked** (owners and admins; default allowed). When blocked, MCP
tools behave as if the workspace's teams don't exist, for every member and
every connected assistant, from the next call on. People's projects outside
the workspace are not affected. The change is audited.

This switch covers the MCP connector only; it is not a data boundary. The same
person's API key, or an opaque OAuth token (one issued without the `/mcp`
resource, which `/mcp` also accepts), still reads and writes that workspace
through `/api/v1` and `/api/graphql`. To cut an app or
agent off completely, revoke it (Settings → OAuth apps) or delete the key;
to keep data out of AI tools entirely, that has to be a policy people follow.

**Public reachability.** claude.ai, Claude Desktop/mobile and ChatGPT call the
server from the vendors' clouds, so these paths must be reachable over public
HTTPS (Claude's egress range is `160.79.104.0/21`):

- `/mcp`
- `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server/api/auth`,
  `/.well-known/openid-configuration/api/auth` and `/api/auth/.well-known/openid-configuration`
- `/api/auth/oauth2/register`, `/api/auth/oauth2/token` and `/api/auth/jwks`

Sign-in and consent (`/login`, `/oauth/consent`, `/api/auth/oauth2/authorize`)
run in the user's own browser, so they can stay on a VPN. An instance only on
the office network works with Claude Code (it connects from the user's machine)
but not with claude.ai or ChatGPT. Options: the Vercel deployment, a reverse
proxy that exposes only the paths above, or a tunnel (`cloudflared`) for
testing. `PUBLIC_APP_URL` / `BETTER_AUTH_URL` must both be that public URL:
the token audience, the metadata and the token issuer are built from them. They
are compared after normalising (letter case, the default port, a trailing
slash). If they differ, the server logs `[mcp] MCP is misconfigured: …` with
both URLs once, and `/mcp` and the protected-resource documents answer 500
with a generic message (the URLs may name internal hosts, so callers don't
see them).

**Client registration.** Claude and ChatGPT register themselves (OAuth dynamic
client registration). Only public clients (PKCE, no secret) with these redirect
URIs (exactly as written: the URI must already be in canonical form) may
register. A request for `client_secret_post` or `client_secret_basic` (claude.ai
sends `client_secret_post`) is registered as a public client and the response
says `token_endpoint_auth_method: none` (RFC 7591 §3.2.1); other methods and
`type: web` are refused:

- `https://claude.ai/api/mcp/auth_callback`
- `https://chatgpt.com/connector_platform_oauth_redirect` and `https://chatgpt.com/connector/oauth/<id>`
- `http://localhost:<port>/…` and `http://127.0.0.1:<port>/…` (Claude Code, MCP Inspector)
- anything listed in `MCP_EXTRA_REDIRECT_URIS` (comma- or space-separated, exact match)

Homepage, logo, terms and privacy URLs (`client_uri`, `logo_uri`, `tos_uri`,
`policy_uri`) must be absolute `https:` URLs or absent, and
`post_logout_redirect_uris` is refused; the same URL rule applies to apps
created in Settings → OAuth apps (Better Auth's own `/oauth2/create-client`
and `/oauth2/update-client` HTTP endpoints are switched off). Self-registered
clients are flagged on the consent screen ("This app registered itself"). The
daily job deletes self-registered clients nobody used (no consent, no token)
after a day, and used ones with no live token for 30 days.

Registration is rate-limited: 5 per minute per client IP, counted in memory
(Better Auth applies rate limits when `NODE_ENV=production`, which the Docker
image and Vercel set). The client IP is the one SvelteKit resolves, never a
header the caller sends:

- **Docker / Node, no proxy**: the connection's address; nothing to set.
- **Behind a reverse proxy**: set `ADDRESS_HEADER=X-Forwarded-For` and
  `XFF_DEPTH` to the number of proxies (see
  [SELF_HOSTING.md](SELF_HOSTING.md)). Without them every caller shares the
  proxy's single limit (strict, not open); the server logs one `[auth] Sign-in
  requests arrive from <address>, a private or loopback address, and
  ADDRESS_HEADER is not set` warning when it sees that.
- **Vercel**: the address Vercel's edge puts in `X-Forwarded-For`; nothing to
  set. The counter lives in each function instance's memory, so the limit is
  per instance: a speed bump against floods, not a guarantee.

**Calls per connection.** Each connection (one user with one assistant, or
one user with one API key) may make 120 MCP requests a minute; a burst up to
that passes, then requests flow at two a second. Over it, `/mcp` answers HTTP
429 with `Retry-After` and a JSON-RPC error. Set `MCP_RATE_LIMIT_PER_MINUTE` to
change it (`0` turns it off). Like the registration limit, the counter is in
memory, so it is per instance (each Vercel function instance or Docker replica
counts on its own).

## Troubleshooting

- **"Couldn't connect" in Claude or ChatGPT right away**: the server isn't
  publicly reachable, or `PUBLIC_APP_URL` doesn't match the URL you pasted.
  `curl -i -X POST https://<host>/mcp` must answer `401` with a
  `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource/mcp", …`
  header, and that URL must return JSON whose `resource` is exactly the pasted URL.
- **A project is missing**: you aren't a member, or its workspace blocks AI
  connectors.
- **"This connection can't make changes"**: the assistant was granted read-only
  access. Disconnect and connect again, allowing write access.

## Testing it for real (Oscar)

Automated tests and a local end-to-end script cover the server, OAuth and the
tools; the vendors' clients need a public URL and real accounts:

1. Deploy the branch (Vercel preview or production) or expose a local instance
   with `cloudflared tunnel --url http://localhost:3010` and set
   `PUBLIC_APP_URL` / `BETTER_AUTH_URL` to the tunnel URL, then build and start
   it (`npm run build && node build`). `PUBLIC_APP_URL` is inlined at build
   time: a build made with another URL serves `/mcp` as 500 "MCP is
   misconfigured" even when the runtime variable is right.
2. Run `npm run db:migrate` against that deployment's database (migration 0010).
3. Claude: Settings → Connectors → Add custom connector → `<url>/mcp` →
   Connect → sign in → the consent screen should read "Claude · claude.ai"
   with the "registered itself" note → Allow. Ask: "List my Ticket System
   projects", "What's assigned to me?", "Create an issue in <KEY> titled …",
   "Move <KEY-n> to In Progress" (Claude asks for confirmation), "Comment on
   <KEY-n> …".
4. ChatGPT: chatgpt.com/plugins → + → Add custom MCP server → `<url>/mcp` →
   OAuth → same prompts.
5. Claude Code on your machine:
   `claude mcp add --transport http ticket-system <url>/mcp`, then `/mcp` to
   sign in; and once with `--header "Authorization: Bearer lc_…"`.
6. Check the audit log (Integrations) shows the three writes with the client
   names, then revoke Claude in Settings → OAuth apps and confirm its next call
   fails.
