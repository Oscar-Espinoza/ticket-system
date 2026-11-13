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
connection, a role without write access, AI connectors blocked), `invalid`
(input that didn't resolve or that the issue service refused) or `failed`
(server error), with a `reason` code. The rows hold the tool, the client and the
issue key, never the issue content the call sent. Only attempts by members of
the team are recorded in its log: an attempt by someone who isn't a member, or
at a team or issue that doesn't exist, leaves no row in any team's log (only a
line in the server log), so outsiders can't put their name or a client name of
their choosing into your log.
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
`create_issue` and `add_comment` take an optional `request_id` (a UUID the
assistant or the view picks): a retry with the same one returns the issue or
comment already created instead of a second copy, and only the call that
created it is audited (also when two calls with the same id race: the service
reports which one replayed). An id used by another user, or for another
issue, is refused ("already in use"). The comment view sends one per draft, so
resending a draft after a timeout is safe. If the audit row can't be written after a successful change, the change
stands and the failure is logged (an error would make the assistant retry and
duplicate it).

Issue text is written by people and may contain instructions; the server tells
the model to treat it as data, text results put descriptions and comment
bodies in fenced `user-content` blocks the text can't close, and titles,
people's names, search snippets and notification lines on one line, inside an
inline code span when they contain Markdown (plain text is left as it is, to
keep lists compact; `structuredContent` is never altered, and only hosts that
show cards receive it: see "Text or cards" below), and the write
limits above apply regardless. One JSON-RPC message per request: batches
(arrays) are refused with HTTP 400.

## Cards in the chat

In Claude (claude.ai, Desktop, mobile) and ChatGPT, the answers to these tools
appear as an interactive card under the assistant's message, in the host's
light or dark theme. Claude Code and other text-only clients get the same
answer as text and never see a card.

### Text or cards: which clients get what

Every tool result has a compact Markdown text, complete on its own (key,
title, state, priority, assignee, labels, dates, waiting on, follow-up, cycle,
epic, link, comment ids, paging cursor and "more available"), with
user-written text fenced as above. Hosts that show cards also get
`structuredContent`, the JSON object the card draws. Only they get it, because
a client that can't show cards may hand the model that JSON instead of the
text: Claude Code (checked with 2.1.323) does exactly that whenever
`structuredContent` is present, so its model would read raw JSON, without
the fencing and at a higher token cost.

A request gets `structuredContent` when either holds:

1. **Its OAuth app is a known card host**: every redirect URI the app
   registered is `https://claude.ai/api/mcp/auth_callback`, a ChatGPT callback
   (`https://chatgpt.com/connector_platform_oauth_redirect`,
   `https://chatgpt.com/connector/oauth/<id>`) or listed in
   `MCP_VIEW_REDIRECT_URIS`. A token reaches an app only through one of its
   redirect URIs, so this can't be faked with request headers.
2. **The request declares MCP Apps support**: clients on protocol revision
   2026-07-28 send their capabilities with every request, and one that lists
   the `io.modelcontextprotocol/ui` extension with `text/html;profile=mcp-app`
   gets cards. (Older clients declare capabilities only once, at
   `initialize`; `/mcp` keeps no sessions, so it can't see them later.)

Everything else gets text only: personal API keys (`lc_…`), loopback apps
(Claude Code, MCP Inspector) and any unknown app. Tool lists are the same for
everyone (tools keep `_meta.ui.resourceUri` and the view resource stays
listed); no tool declares an `outputSchema`, so a text-only result is valid.

**Another host that shows cards**: add its OAuth callback URL, exactly, to
`MCP_VIEW_REDIRECT_URIS` (comma- or space-separated). That also allows it to
register, so it need not be in `MCP_EXTRA_REDIRECT_URIS` too. Its users then
remove and re-add the connector, so the app registers again with that URI.

| Tool | Card |
|---|---|
| `list_issues`, `search_issues`, `my_work` | Issue list: priority, key, title, state (in its colour), assignee, labels, due date, waiting on, follow-up. `my_work` groups by priority and `list_issues` by state when asked. **Load more** fetches the next page; clicking a row opens the issue inline; **Show full screen** on long lists |
| `list_inbox` | The same list for notifications (unread dot, who did what); a row with an issue opens it inline |
| `get_issue`, `create_issue`, `update_issue`, `add_comment` | Issue detail: all fields, the description as Markdown, sub-issues, relations and the last 5 comments. **State** (pick a state), **Assign to me** / **Unassign** and a comment box act as you, through the same tools and checks as the assistant's own calls; the card shows what changed and tells the assistant |
| `get_project_overview`, `get_cycle` | Project overview: cycle progress, burndown chart, issues by state, recent (or the cycle's open) issues |
| `list_projects` | Project cards with key, name and open issue count |

Each card has **Open in Ticket System**, which opens the page in your browser
through the assistant's app (the card itself never navigates). Descriptions and
comments are shown as Markdown; HTML written in them shows as literal text,
links open only if they are `http(s)` (through the assistant's app, never by
the card navigating; other schemes, `mailto:` included, show as plain text),
images aren't loaded (their alt text shows), and bare URLs aren't turned into
links. `get_project_metadata` has no card.

The cards make no network requests of their own: every read and write goes
through the assistant's connection, so no token is ever inside the card. They
load no image, font or script from anywhere (people show as initials). Writes
from a card (state, assignee, comment) need an assistant app that forwards tool
calls; without that the controls are not shown. A comment sent from a card
carries a `request_id`, so if the app doesn't answer in time the card checks
whether the comment was posted before it allows sending again.

When you reload a chat, claude.ai and ChatGPT draw each card again from the
tool result the assistant first got, so a card would show what the issue looked
like then. To avoid that, a card shows that result at once and, once it is on
screen, asks the server again (a read: `get_issue` for an issue, the same list or
overview call for the others) and shows the newer answer, with a small "Updated
to the latest." under it. It never runs a write again, leaves a card alone while
you are typing a comment or have loaded more rows, and keeps the first result
(with a note) if the read fails. If the issue is gone or you no longer have
access, the card says so instead of showing old data. Search results have no
refresh (the card does not know the search), and it needs an assistant app that
forwards tool calls, like the writes. Each reload costs one read per visible
card, within the 120 calls per minute limit.

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
slash), but use the canonical form anyway: lowercase host, `https` unless
`localhost`, no default port, no trailing slash (Better Auth does not rewrite
the issuer consistently). If they differ, the server logs `[mcp] MCP is misconfigured: …` with
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
- `http://localhost:<port>/…` and `http://127.0.0.1:<port>/…` (Claude Code, MCP Inspector), also with no path (`http://localhost:<port>`)
- anything listed in `MCP_EXTRA_REDIRECT_URIS` or `MCP_VIEW_REDIRECT_URIS` (comma- or space-separated, exact match)

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
counts on its own). It is per connection, not per person: someone with several
API keys or assistants gets the allowance once for each.

## Troubleshooting

- **"Couldn't connect" in Claude or ChatGPT right away**: the server isn't
  publicly reachable, or `PUBLIC_APP_URL` doesn't match the URL you pasted.
  `curl -i -X POST https://<host>/mcp` must answer `401` with a
  `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource/mcp", …`
  header, and that URL must return JSON whose `resource` is exactly the pasted URL.
- **A project is missing**: you aren't a member, or its workspace blocks AI
  connectors.
- **Text instead of a card**: the host didn't render the view, or `/mcp`
  doesn't know it shows cards. Check that the host supports MCP Apps
  (claude.ai and ChatGPT do; Claude Code and MCP Inspector show text), that
  another host is listed in `MCP_VIEW_REDIRECT_URIS` ("Text or cards" above),
  that the build includes the bundle (`npm run build`
  runs `build:mcp-ui`; `resources/read` on `ui://ticket-system/app.<hash>.html`
  should return `text/html;profile=mcp-app`), and that the connector was
  re-added or refreshed after a deploy (hosts cache tool lists).
- **"This connection can't make changes"**: the assistant was granted read-only
  access. Disconnect and connect again, allowing write access.

## The view bundle (for admins and developers)

The cards are one HTML file built from `src/mcp-ui/` by `npm run build:mcp-ui`
(about 255 KB; run for you by `npm run dev` and `npm run build`, and by the
Docker build). It is embedded in the server build, so it needs no files at
runtime on Vercel or in the image. The resource URI contains a hash of the file
(`ui://ticket-system/app.<hash>.html`): ChatGPT caches a resource by URI for up
to an hour, so a new build gets a new URI and shows up at once. Claude and
ChatGPT show a card only for tools whose `_meta.ui.resourceUri` points at it;
text clients ignore that field.

To look at a card without Claude or ChatGPT, use a minimal MCP Apps host such as
the `examples/basic-host` of
[modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps)
(clone it outside this repository) pointed at a local `/mcp` with an API key.

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
6. Cards: in Claude and ChatGPT the answers to "What's assigned to me?" and
   "Show WEB-12" should appear as cards, not only text (if you only see text,
   see Troubleshooting). Click a row to expand it, **Load more**, change a
   state from the card, **Assign to me**, add a comment, **Open in Ticket
   System** (opens a browser tab), and the full-screen button on a long list.
   In Claude Code the same prompts show text only, and the model gets the
   Markdown text (fenced `user-content` blocks), not JSON.
7. Check the audit log (Integrations) shows the writes with the client
   names, then revoke Claude in Settings → OAuth apps and confirm its next call
   fails.
