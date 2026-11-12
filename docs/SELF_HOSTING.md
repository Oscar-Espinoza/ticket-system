# Self-hosting

The app normally runs on Vercel + Neon. For internal use it also runs anywhere
Docker runs, as **one app container plus a plain Postgres**. On start the app
applies its database migrations and schedules the daily jobs itself, so there
is nothing else to run.

## What runs

| Service | What it does |
| --- | --- |
| `postgres` | Postgres 17. All data, including uploaded files, lives in the `pgdata` volume. |
| `app` | The SvelteKit server (adapter-node build) on port `APP_PORT` (default 3000). Health check: `GET /api/health`. On start it migrates the database, then runs the daily jobs (digests, SLAs, recurring issues, webhook retries) at `CRON_HOUR_UTC` (default 08:00 UTC). |

Plan for about 1 GB RAM and 3 GB disk for the image and data. Run **one** app
container: every app container started with `SELF_HOSTED=true` runs the daily
jobs. A run missed while the app is down is not made up at start; the next one
happens at the usual hour. A job still running after 10 minutes is reported in
the logs and the next job starts.

## Start

```bash
cp docker/selfhost.env.example .env
# Fill in POSTGRES_PASSWORD, BETTER_AUTH_SECRET (the file says how to generate
# each) and APP_URL — the URL people will open.
docker compose up -d --build
```

Open `APP_URL`, sign up, create a workspace and invite people.

- **HTTPS**: put a reverse proxy (Caddy, Traefik, nginx) in front of the `app`
  port and set `APP_URL` to the `https://` address. Rebuild after changing
  `APP_URL` (`docker compose up -d --build`): it is baked into the browser bundle
  and is the origin the server accepts form and remote-function posts from.
- **Client IP behind the proxy**: sign-in and OAuth client registration are
  rate-limited per client IP, read from the connection by default. Behind a
  reverse proxy every request comes from the proxy, so all users share one
  limit: set `ADDRESS_HEADER=X-Forwarded-For` and `XFF_DEPTH` to the number of
  proxies in front of the app (1 for one proxy that appends the client
  address, as Caddy, Traefik and nginx's `proxy_add_x_forwarded_for` do). Only
  set them when every request reaches the app through those proxies: the app
  trusts that header. When sign-in requests arrive from a private or loopback
  address and `ADDRESS_HEADER` is unset, the server logs one warning saying so.
- **Uploads**: the image sets `BODY_SIZE_LIMIT=6M` (attachments and uploads are
  capped at 4 MB, webhooks at 5 MB). Raise it in the environment if you need more.
- **Updates**: `git pull && docker compose up -d --build`. The new container
  applies any new migrations before it serves requests; if a migration fails it
  exits instead of starting (`docker compose logs app`).
- **Backups**: `docker compose exec postgres pg_dump -U tickets tickets > backup.sql`.

## Using a Postgres you already have

Skip the `postgres` service and run only the app image (Postgres 14 or newer):

```bash
docker build --build-arg PUBLIC_APP_URL=https://tickets.example.com -t ticket-system-app .
docker run -d --name tickets --restart unless-stopped -p 3000:3000 \
  -e DATABASE_URL=postgres://tickets:secret@db.internal:5432/tickets \
  -e BETTER_AUTH_URL=https://tickets.example.com \
  -e PUBLIC_APP_URL=https://tickets.example.com \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  ticket-system-app
```

Set `PUBLIC_APP_URL` and `BETTER_AUTH_URL` to the same canonical URL: lowercase
host, `https` (plain `http` only for `localhost`), no default port, no trailing
slash. AI assistants (MCP) compare the OAuth issuer byte for byte, and Better
Auth does not rewrite a non-canonical URL consistently.

Add `?sslmode=require` to `DATABASE_URL` if the server requires TLS. The app
uses the standard Postgres driver for any host that isn't `*.neon.tech`
(`DATABASE_DRIVER=pg|neon` overrides the guess) and keeps up to
`DATABASE_POOL_MAX` (default 10) connections open. A query running longer than
`DATABASE_STATEMENT_TIMEOUT_MS` (default 60000, `0` = no limit) is cancelled;
migrations are exempt.

## Optional features

Every integration switches off cleanly when its variables are empty
(`docker/selfhost.env.example` lists them): GitHub sign-in and PR automation
(`GITHUB_*`), Google sign-in (`GOOGLE_*`), email (`RESEND_API_KEY`,
`EMAIL_FROM`; also email verification, password reset and
`REQUIRE_EMAIL_VERIFICATION`), web push
(`*VAPID*`), Slack (`SLACK_*`).

### Google sign-in

Adds "Continue with Google" to the sign-in and sign-up pages (and so to invite
links, which go through them). With `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET`
empty the button does not appear and nothing is registered. Google is identity
only: the app asks for `openid`, `email` and `profile`, nothing else, and never
reads or uses a Google token (GitHub branch creation still needs GitHub).

1. In the [Google Cloud Console](https://console.cloud.google.com/) pick or
   create a project (use one owned by the company Google Workspace).
2. **APIs & Services → OAuth consent screen** (called **Google Auth Platform →
   Branding / Audience** in the newer console). Choose the user type:
   - **Internal** if everyone who signs in has an account in your Google
     Workspace. Only people in that Workspace can sign in; this is the right
     choice for a company tool and needs no Google review.
   - **External** only if people outside a Workspace (personal Gmail) must sign
     in. It starts in "Testing" (test users only, tokens expire) and needs
     publishing; this is not a way to limit sign-in to your company.
   Fill in the app name and support email; the scopes stay `openid`, `email`,
   `profile` (the defaults, no sensitive scopes, so no verification).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   application type **Web application**.
   - **Authorized JavaScript origins**: your `APP_URL`, e.g.
     `https://tickets.example.com` (local dev: `http://localhost:3000`).
   - **Authorized redirect URIs**: `<APP_URL>/api/auth/callback/google`, e.g.
     `https://tickets.example.com/api/auth/callback/google` (local dev:
     `http://localhost:3000/api/auth/callback/google`). It must match exactly,
     including `http`/`https` and any port. Add one entry per origin you use.
4. Copy the client ID and secret into `.env` (`GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`) and restart the app (`docker compose up -d`). They are
   read at runtime; no rebuild is needed.

Rules that apply to Google like they do to GitHub: an existing account is linked
only when Google reports the email as verified and the account's email is
verified in this app (see [Email verification](#email-verification); until then
the person gets "account not linked" and signs in the way they did before);
a domain with "Enforce SSO" turned on cannot use Google to get around it.

### Email verification

Accounts created through Google, GitHub or SSO arrive verified when the provider
says the address is verified. Password accounts start unverified. When email is
configured (`RESEND_API_KEY` and `EMAIL_FROM`), the app:

- emails a verification link on password sign-up (it works for 24 hours and
  lands on `/email-verification`; signing up still signs you in);
- honours a link **only inside a session of the account it names**. "Verified"
  means the holder proved both the password and the mailbox. Opened signed out,
  as another account, or fetched by a mail scanner, the link changes nothing:
  the page asks for that account's password, signs in with it and finishes.
  So someone who registers another person's address can't get it verified by
  that person clicking the email, and the email tells such a person to reset
  the password instead (below);
- shows signed-in unverified users a "Verify your email" banner on the
  dashboard and a row in Settings → Profile, both with a resend button. Only
  the signed-in holder can ask for a link (`/api/auth/send-verification-email`
  refuses signed-out callers and always lands the link on the dashboard), at
  most one email per account per minute, plus Better Auth's per-IP limit;
- once the address is verified, "Continue with Google" or "Continue with GitHub"
  with the same address signs in to that same account and links it. Linking
  never happens while either side is unverified, and no provider is "trusted"
  to skip that check. Opening a link never signs anyone in by itself (that
  would skip the password, two-factor and "Enforce SSO").

`REQUIRE_EMAIL_VERIFICATION=true` (off by default) also refuses password sign-in
to unverified accounts; a correct password then emails a fresh link (same
one-a-minute limit). The link's page signs the holder in with the password plus
the link itself (the only way an unverified account gets a session while the
switch is on), then verifies. Sign-up says "check your email" instead of
signing in. The switch is ignored while email isn't configured, so it can't
lock anyone out. Existing sessions are not ended. Turn it on only after
existing users have had time to verify.

Without email configured nothing changes: no email, no banner, no resend
button, no "Forgot password?", everyone signs in as before, and password
accounts stay unverified (so Google/GitHub can't be linked to them by signing
in). An admin who has confirmed the person owns the address another way can
mark it verified in the database:

```sql
UPDATE "user" SET email_verified = true, updated_at = now() WHERE email = 'person@example.com';
```

(`docker compose exec postgres psql -U tickets tickets`; emails are stored
lowercase.) Don't do this for an address you haven't confirmed: a verified
address lets anyone who controls that Google/GitHub identity into the account.

#### Password reset

With email configured, "Forgot password?" on the sign-in page emails a reset
link. The answer is the same whether or not the address has an account. The link
opens `/reset-password` with its token in the URL fragment (never sent to the
server or in a Referer), works once, for one hour, and only the newest one
works; at most one reset email per account per minute, plus Better Auth's
per-IP limit on `/api/auth/request-password-reset`. The app never logs the
link. Domains with "Enforce SSO" get the same refusal as on password sign-in,
also for a link sent before SSO was enforced.

Completing a reset proves the mailbox and sets the password, so it:

- marks the address verified and signs out **every** session of the account;
- never signs in by itself: the next sign-in still asks for two-factor when
  it is enabled.

If the account was **unverified** before the reset, the reset is the real
owner claiming an address someone else may have registered. Everything the
previous holder could have set up is removed in one transaction (the same
cleanup runs when a workspace's SSO links to an unverified account):

| Removed | Kept |
| --- | --- |
| every session; the old password (replaced) | the account itself, its name, avatar and profile |
| linked Google, GitHub and other social sign-ins (SSO and SCIM identities stay: an IdP on a DNS-proven domain vouched for them) | workspace and project memberships (they came from invitations; a workspace admin can remove them) |
| two-factor enrolment and its backup codes | tickets, comments and other content it wrote |
| API keys | |
| OAuth apps it registered, and every app consent, access and refresh token it granted (authorized apps, MCP connectors) | |
| Slack DM links and web-push subscriptions | |

An audit event (`security.account_claimed`) records it. Afterwards the owner
signs in with the new password, and "Continue with Google" links to the account.

Decisions about other ways an address can be proven:

| Event | Marks the address verified? |
| --- | --- |
| Sign-up or sign-in through Google, GitHub or SSO | Yes, if the provider says the address is verified (unchanged). |
| Opening the emailed verification link while signed in to that account | Yes (and only then). |
| Completing a password reset | Yes, and on an unverified account it claims it (above). |
| Accepting an invitation | No: invite links are shareable, they don't prove anyone owns an address. |
| Changing the email in settings | Not possible: the address is read-only in the profile and Better Auth's change-email is off, so a verified flag can never move to an unproven address. |
| SCIM / SSO provisioning | As the SSO/SCIM code sets it (a SCIM email change resets it to unverified); SSO linking to an unverified account claims it (above). |

#### Existing users

People who signed up with a password before verification existed:

1. Sign in with email and password as before.
2. Use **Resend email** on the dashboard banner (or Settings → Profile) and open
   the link while still signed in.
3. Sign out and use **Continue with Google** (or GitHub) with the same address:
   it opens the same account and links it, so either way of signing in works
   from then on.

If someone tries Google first they see "account not linked" on the sign-in page,
with these same steps. A person who never set that password (someone else
signed up with their address, or they forgot it) uses **Forgot password?**:
the reset proves the address, takes the account back as described above, and
then Google links. Without email configured, an admin can delete the squatter's
account so the person can sign up with Google.

**SSO (SAML/OIDC) and SCIM** work self-hosted. A workspace admin proves the
company domain with a DNS TXT record (`_ticket-system.<domain>`), shown in
workspace settings → Security. The record must stay published: the app re-checks
it and stops trusting the IdP for that domain if it disappears.

**AI assistants (MCP)** work self-hosted with Claude Code out of the box (it
connects from each user's machine). claude.ai, Claude Desktop/mobile and
ChatGPT connect from the vendors' clouds, so `/mcp`, the `/.well-known/oauth-*`
documents and `/api/auth/oauth2/{register,token}` + `/api/auth/jwks` must be on
public HTTPS, and `APP_URL` must be that public URL; sign-in and consent can
stay on the VPN. A reverse proxy exposing only those paths, or a
`cloudflared` tunnel for a test, is enough. Extra OAuth redirect URIs for other
MCP clients go in `MCP_EXTRA_REDIRECT_URIS`. Set `ADDRESS_HEADER` / `XFF_DEPTH`
(above) so client registration is limited per caller. `MCP_RATE_LIMIT_PER_MINUTE`
(default 120, `0` = off) caps MCP calls per connection, per replica. Details: [MCP.md](MCP.md).

## Database tests

The tests in `src/tests/local-db` and `src/tests/mcp` run the issue service against a throwaway
local Postgres, never against Neon: they are skipped unless `LOCAL_DB_TESTS=1`
and `DATABASE_URL` points at this machine.

```bash
docker run -d --rm --name ts-pg -p 5433:5432 --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=main postgres:17-alpine
DATABASE_URL=postgres://postgres:postgres@localhost:5433/main node scripts/migrate.mjs
npm run test:db
```

`migrate.mjs` needs a moment after `docker run` while Postgres starts; it
retries on its own.

`npm run test:db:neon` runs the same suite through the Neon driver (what
Vercel uses). It needs the local Neon proxy in front of the same, still running
Postgres (CI runs it as the `neon-driver` job; each query is a separate HTTP
round trip through the proxy, so `test:db:neon` uses a 120 s test timeout):

```bash
docker network create ts-test && docker network connect ts-test ts-pg
docker exec -i ts-pg psql -U postgres -d main < docker/neon-proxy-test-init.sql
docker run -d --rm --name ts-neon --network ts-test -p 4444:4444 \
  -e PG_CONNECTION_STRING=postgres://postgres:postgres@ts-pg:5432/main \
  ghcr.io/timowilhelm/local-neon-http-proxy:main
npm run test:db:neon
docker stop ts-neon && docker network disconnect ts-test ts-pg && docker network rm ts-test
```

When you're done, `docker stop ts-pg` (it was started with `--rm`, so this
also deletes it and its data).
