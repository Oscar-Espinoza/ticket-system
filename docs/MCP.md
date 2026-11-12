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
| `search_issues` | read | Full-text search with filters (`assignee:me label:bug priority:high state:started is:open`) |
| `list_issues` | read | One project's issues: state, assignee, label, updated since, paging, group by state |
| `my_work` | read | Your open issues across projects, most urgent first |
| `get_issue` | read | One issue with recent comments, sub-issues and relations |
| `get_project_overview` | read | Counts by state, current cycle progress and burndown, recent issues |
| `get_cycle` | read | A cycle's scope, progress, burndown and open issues |
| `get_project_metadata` | read | Valid states, labels, members, cycles and epics |
| `list_inbox` | read | Your notifications |
| `create_issue` | write | Create an issue |
| `update_issue` | write | Change title, description, state, priority, assignee, labels, estimate, due date, cycle, epic |
| `add_comment` | write | Comment on an issue |

Nothing else: no deleting, archiving, moving, bulk edits, members, roles,
settings or integrations. Every write is recorded in the audit log as
`mcp.tool_call` with the assistant's name (workspace or team → Audit log,
category Integrations). The assistant acts with your own permissions: it sees
only projects you are a member of, and a guest can still only read and comment.

Hosts ask before `update_issue` runs (it is marked as overwriting data).
Issue text is written by people and may contain instructions; the server tells
the model to treat it as data, and the write limits above apply regardless.

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
testing. `PUBLIC_APP_URL` / `BETTER_AUTH_URL` must be that public URL: the
token audience and the metadata are built from it.

**Client registration.** Claude and ChatGPT register themselves (OAuth dynamic
client registration). Only public clients (PKCE, no secret) with these redirect
URIs may register:

- `https://claude.ai/api/mcp/auth_callback`
- `https://chatgpt.com/connector_platform_oauth_redirect` and `https://chatgpt.com/connector/oauth/<id>`
- `http://localhost:<port>/…` and `http://127.0.0.1:<port>/…` (Claude Code, MCP Inspector)
- anything listed in `MCP_EXTRA_REDIRECT_URIS` (comma- or space-separated, exact match)

Registration is rate-limited (5 per minute per IP; Better Auth applies rate
limits when `NODE_ENV=production`, which the Docker image and Vercel set).
Self-registered clients are flagged on the consent screen ("This app registered
itself"), and the daily job deletes those with no live token for 30 days.

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
   `PUBLIC_APP_URL` / `BETTER_AUTH_URL` to the tunnel URL before starting it.
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
