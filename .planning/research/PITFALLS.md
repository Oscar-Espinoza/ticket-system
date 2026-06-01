# Pitfalls Research

**Domain:** Multi-tenant Linear-style ticket system with GitHub integration
**Researched:** 2026-06-01
**Confidence:** HIGH (all critical pitfalls verified against official docs or multiple credible sources)

---

## Critical Pitfalls

### Pitfall 1: Webhook Route Not Excluded From Auth Middleware

**What goes wrong:**
Auth.js middleware (or any `middleware.ts` with a catch-all matcher) intercepts every request, including the GitHub webhook endpoint. GitHub's webhook delivery is not an authenticated user session — it sends no session cookie — so the middleware returns a 401 or redirects to the sign-in page before the handler ever runs. Webhooks silently fail. Tickets never auto-advance.

**Why it happens:**
Developers write `export { auth as middleware } from "./auth"` and assume the framework is smart enough not to apply session checks to API endpoints. Next.js middleware runs on every matched path by default, and the default matcher matches everything.

**How to avoid:**
Explicitly exclude the webhook route in the middleware matcher config:

```ts
// middleware.ts
export const config = {
  matcher: ["/((?!api/webhooks).*)"],
};
```

The webhook route must also never be listed as a protected route in Auth.js `authorized` callbacks. It authenticates itself via HMAC signature, not sessions. Verify this exclusion at build time with a unit test that asserts the route returns 200 for a valid signature without a session cookie.

**Warning signs:**
- GitHub webhook delivery history shows all deliveries as 401 or 302 responses
- Ticket status never changes despite PRs being opened/merged
- No log output from the webhook handler despite GitHub showing successful delivery

**Phase to address:** GitHub integration phase (webhook setup)

---

### Pitfall 2: Raw Body Consumed Before HMAC Verification

**What goes wrong:**
The GitHub webhook handler calls `request.json()` first to parse the payload, then attempts to verify the `X-Hub-Signature-256` header by re-serializing the object. HMAC verification fails every time because the re-serialized JSON differs from the original raw bytes (whitespace, key ordering). All webhook deliveries are rejected as invalid.

**Why it happens:**
Next.js App Router uses the Web Fetch API `Request` object. Unlike Express (where you opt into `express.raw()`), the body stream can only be read once. If you call `.json()` first, the stream is consumed and you cannot get the original bytes back for HMAC comparison.

**How to avoid:**
Always read the raw body as text first, verify the signature, then parse JSON from the string:

```ts
// app/api/webhooks/github/route.ts
export async function POST(req: Request) {
  const rawBody = await req.text(); // consume once as text
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const secret = process.env.GITHUB_WEBHOOK_SECRET!;

  const hmac = createHmac("sha256", secret);
  hmac.update(rawBody);
  const expected = `sha256=${hmac.digest("hex")}`;

  // Use timingSafeEqual to prevent timing attacks
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = JSON.parse(rawBody); // parse from the string you already have
  // ...
}
```

**Warning signs:**
- All webhook requests return 401 immediately
- HMAC computed in handler never matches, even with the correct secret
- Works in local testing (mocked) but fails against real GitHub deliveries

**Phase to address:** GitHub integration phase (webhook setup)

---

### Pitfall 3: Auth.js v5 Credentials + Drizzle Adapter Defaults to Database Sessions

**What goes wrong:**
When a Drizzle adapter is provided to Auth.js, the default session strategy is `"database"`. The Credentials provider, however, only works with JWT sessions. Auth.js throws at runtime or silently falls back in a way that breaks sign-in. Users cannot log in with email/password even though the route appears to exist.

**Why it happens:**
This is a documented but non-obvious constraint: Credentials providers require JWT sessions because they cannot create a database session record in the same atomic operation as sign-in. Adding an adapter switches the default strategy to `"database"` without warning.

**How to avoid:**
Explicitly force JWT strategy in the Auth.js config whenever Credentials is used alongside an adapter:

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: "jwt" }, // REQUIRED when using Credentials with an adapter
  providers: [
    Credentials({ ... }),
    GitHub({ ... }),
  ],
});
```

**Warning signs:**
- Email/password sign-in redirects back to login page with no error message
- Console shows `[auth][error] CredentialsSignin` but the authorize function returns a valid user object
- GitHub OAuth sign-in works; Credentials does not

**Phase to address:** Auth phase

---

### Pitfall 4: GitHub OAuth Access Token Stored Plaintext in the Database

**What goes wrong:**
Auth.js stores the GitHub `access_token` in the `accounts` table via the adapter. The token grants `repo` and `admin:repo_hook` scope — meaning anyone who reads that database row can create branches, push code, and install webhooks on behalf of any connected user. A leaked database backup or SQL injection exposes all GitHub credentials.

**Why it happens:**
The Drizzle adapter writes `access_token` directly to the `accounts.access_token` column as a plain string. There is no built-in encryption layer in Auth.js adapters.

**How to avoid:**
Encrypt the token before it reaches the database. Use the Auth.js `jwt` callback to intercept the GitHub token and store an encrypted version, or encrypt at the application layer before the adapter writes it. A simple approach using `NODE_ENV`-scoped AES-256-GCM:

```ts
// In jwt callback — store encrypted token in JWT payload only (not DB)
// For DB persistence, encrypt with a separate APP_SECRET before writing
```

At minimum, ensure the `accounts` table has column-level encryption, or store the GitHub token separately in an `oauth_tokens` table with AES-256-GCM encryption using an `APP_SECRET` environment variable that is NOT the same as `AUTH_SECRET`.

Additionally, store only the access token that Auth.js provides. GitHub Classic OAuth apps issue non-expiring tokens, so there is no refresh token rotation needed — but this also means a leaked token is valid indefinitely unless the user revokes it.

**Warning signs:**
- `accounts` table rows contain readable `ghp_...` token strings
- No encryption key rotation strategy exists
- `APP_SECRET` and `AUTH_SECRET` are the same value

**Phase to address:** Auth phase (GitHub OAuth connect flow)

---

### Pitfall 5: GitHub Access Token Stored in JWT Payload Exposed to Client

**What goes wrong:**
Developers put the GitHub `access_token` into the JWT session and then expose it via the `session` callback so client components can call GitHub APIs directly. The token is now readable on the client and visible in any network request that reads `getSession()`. XSS or a compromised dependency can exfiltrate all users' GitHub tokens.

**Why it happens:**
The Auth.js docs show `session.accessToken = token.accessToken` as a pattern for making OAuth tokens available. It is convenient and works, but it leaks the token to the browser.

**How to avoid:**
Never expose the GitHub token to client-side code. Keep it server-side only:
- Store the token in the JWT (server-side only, signed/encrypted by `AUTH_SECRET`)
- All GitHub API calls (branch creation, webhook registration) happen in Server Actions or Route Handlers — never in Client Components
- The `session` callback should NOT forward the token; only expose a boolean `githubConnected: true` to the client

**Warning signs:**
- `useSession()` returns an object that includes `accessToken` or `githubToken`
- Client components make fetch calls to `https://api.github.com` directly
- The token appears in browser DevTools Network tab

**Phase to address:** Auth phase (GitHub OAuth connect flow), Tickets/board phase (branch creation)

---

### Pitfall 6: Insecure Direct Object Reference (IDOR) on Ticket and Project Resources

**What goes wrong:**
A route handler fetches a ticket by its ID from the URL (e.g., `GET /api/projects/[projectId]/tickets/[ticketId]`) and returns it without checking whether the authenticated user is a member of that project. Any authenticated user who knows or guesses a ticket ID can read, modify, or delete any ticket across all projects.

**Why it happens:**
Developers rely on Next.js middleware for authentication (confirming the user is logged in) and assume that is sufficient. Authorization — confirming the user has access to *this specific resource* — is a separate check that must happen at the data-access layer, not just at the route layer.

**How to avoid:**
Every data-access function that returns project-scoped data must include the `userId` in the query and join against `project_members`:

```ts
// WRONG — only checks that ticket exists
const ticket = await db.query.tickets.findFirst({
  where: eq(tickets.id, ticketId),
});

// CORRECT — checks membership inline
const ticket = await db
  .select()
  .from(tickets)
  .innerJoin(project_members, eq(project_members.projectId, tickets.projectId))
  .where(
    and(
      eq(tickets.id, ticketId),
      eq(project_members.userId, session.user.id)
    )
  )
  .limit(1);
```

Create a reusable `assertProjectMember(userId, projectId)` helper that throws a 403 if membership is not found. Call it at the top of every handler that touches project-scoped data.

**Warning signs:**
- Any API route that accepts a resource ID without joining against a membership table
- `403 Forbidden` responses are never returned — only `404` or `200`
- Integration tests never assert that user B cannot access user A's project

**Phase to address:** Projects/invites phase (when project membership is introduced), enforced again in every subsequent phase

---

### Pitfall 7: Invite Tokens With Weak Entropy, No Expiry, or Reusable After Acceptance

**What goes wrong:**
Invite links use predictable tokens (UUIDs v1, short random strings, base64-encoded IDs), never expire, or remain valid after being accepted. A brute-force scan or a token found in browser history can add unauthorized users to any project.

**Why it happens:**
Developers reach for `crypto.randomUUID()` (which is fine) but skip expiry and single-use invalidation because they seem like edge cases. Since invites are shared as copy-paste links rather than emailed, there is no natural expiry tied to a mail delivery window.

**How to avoid:**
- Generate tokens with `crypto.getRandomValues` → 32 bytes → hex (256 bits of entropy, well above the 128-bit minimum)
- Set an expiry of 7 days (reasonable for team invites shared via Slack/email)
- Mark tokens as `used: true` immediately on acceptance in the same DB write that creates the project_member row (use a non-interactive transaction)
- Optionally: scope the invite token to a specific role (owner/member) so an intercepted link cannot escalate privilege
- Do NOT bind invites to a specific email address — this project deliberately avoids an email service, so enforcing email matching would require email verification infrastructure that doesn't exist

```ts
// schema: invites table
inviteToken: text("invite_token").notNull().unique(),
expiresAt: timestamp("expires_at").notNull(),
usedAt: timestamp("used_at"),   // null = still valid
projectId: uuid("project_id").notNull().references(() => projects.id),
role: text("role").notNull().default("member"),
```

**Warning signs:**
- Invite tokens are UUIDs — check if they're v1 (timestamp-based) or shorter than 32 hex chars
- Accepting an invite does not invalidate the token (can be reused)
- No `expiresAt` column in the invites table
- Invite link works indefinitely after project is full or user has left

**Phase to address:** Projects/invites phase

---

### Pitfall 8: Ticket Counter Race Condition via Read-Then-Write

**What goes wrong:**
Two concurrent requests create tickets in the same project simultaneously. Both read `SELECT max(counter) FROM tickets WHERE projectId = ?`, get the same value (say 41), and both insert tickets with counter 42. One insert fails (unique constraint) or — worse, without a constraint — both succeed and two tickets are labeled "APP-42".

**Why it happens:**
The natural first implementation is a two-step read-then-write, which is not atomic. Between the SELECT and INSERT, another request can complete its own SELECT with the same result.

**How to avoid:**
The PROJECT.md key decision already identifies the correct pattern: atomic `UPDATE...RETURNING` on a per-project counter row. This is a single SQL statement and is atomically safe without a transaction wrapper:

```ts
// projects table has: ticketCounter: integer default 0
const [{ nextCounter }] = await db
  .update(projects)
  .set({ ticketCounter: sql`${projects.ticketCounter} + 1` })
  .where(eq(projects.id, projectId))
  .returning({ nextCounter: projects.ticketCounter });

// Then insert ticket using nextCounter
await db.insert(tickets).values({
  projectId,
  counter: nextCounter,
  identifier: `${project.key}-${nextCounter}`,
  // ...
});
```

A single `UPDATE` statement in PostgreSQL is inherently atomic at `READ COMMITTED` isolation — no explicit transaction needed, and compatible with `neon-http` non-interactive mode.

**Warning signs:**
- Ticket creation uses a `SELECT max()` followed by an `INSERT` (two queries)
- No unique constraint on `(projectId, counter)`
- Load testing shows duplicate ticket identifiers

**Phase to address:** Tickets/board phase (ticket creation)

---

### Pitfall 9: neon-http Non-Interactive Transaction Limitation Causes Silent Failures

**What goes wrong:**
Code attempts to use `db.transaction(async (tx) => { ... })` with Drizzle + neon-http driver in a way that requires session-based or interactive transactions (reading a result mid-transaction to decide the next query). neon-http supports only non-interactive batch transactions — all queries must be known upfront. Using interactive patterns either silently serializes queries outside a transaction or throws at runtime.

**Why it happens:**
Drizzle's `db.transaction()` API looks the same regardless of driver, so developers write interactive transaction logic assuming it will work. The neon-http driver's `transaction()` batches all queries into one HTTP request; if any query inside depends on the result of a prior query in the same transaction, the logic breaks.

**How to avoid:**
For operations that require reading a result before deciding the next step (e.g., checking a condition then updating), use the neon WebSocket driver (`@neondatabase/serverless` with `neonConfig.webSocketConstructor`), or restructure to avoid dependencies between queries (use `RETURNING` clauses and application logic outside the transaction).

For this project's scale (hobby tier, low concurrency), the safest approach is:
- Use single-statement atomic operations (`UPDATE...RETURNING`) wherever possible
- Reserve multi-statement transactions for non-interactive batches (insert ticket + log entry together)
- Document any place where WebSocket mode would be needed in a future scale-up

**Warning signs:**
- Transaction code that reads `tx.select()...` and then branches on the result before calling `tx.update()`
- Mysterious "operation not supported" or silent rollbacks in neon-http mode
- Tests pass locally with a pg driver but fail on Vercel/Neon

**Phase to address:** Tickets/board phase; GitHub integration phase (webhook handler batch writes)

---

### Pitfall 10: Vercel Hobby Tier 10-Second Timeout Kills Webhook Processing

**What goes wrong:**
The GitHub webhook handler attempts to do too much synchronous work — verify signature, parse payload, query the database, match the PR branch to a ticket, update ticket status, update GitHub commit status — within a single serverless function invocation. If any step is slow (Neon cold start, database query latency), the function times out at 10 seconds and returns 504. GitHub retries the webhook, potentially double-processing it.

**Why it happens:**
Vercel Hobby functions have a hard 10-second maximum duration. Neon Postgres on the free tier can have cold-start latency of 500ms–2000ms on the first connection. Chained database queries add up.

**How to avoid:**
- **Respond fast, then work:** Use Next.js `after()` (available in Next.js 15) to queue the processing work after sending a 200 response to GitHub. GitHub marks the delivery as successful, and the background work continues.
- **Keep the handler lean:** Only do the HMAC check synchronously. Everything else — DB lookups, status updates — goes in `after()`.
- **Idempotency key:** Store the GitHub delivery ID (`X-GitHub-Delivery` header) in the database and skip reprocessing if it's already been handled. This prevents the retry-on-timeout scenario from creating duplicate status transitions.

```ts
export async function POST(req: Request) {
  // ... verify HMAC synchronously ...

  after(async () => {
    // database work here — after 200 is sent
  });

  return new Response("OK", { status: 200 });
}
```

**Warning signs:**
- Webhook handler makes 3+ database queries sequentially
- No `X-GitHub-Delivery` idempotency check
- Vercel function logs show timeouts on webhook invocations
- GitHub delivery history shows retries (indicating prior failures)

**Phase to address:** GitHub integration phase (webhook handler)

---

### Pitfall 11: bcryptjs Work Factor Causing Login Timeouts on Cold Starts

**What goes wrong:**
`bcrypt.compare()` with a high work factor (12+) is CPU-intensive. On a Vercel serverless cold start, the function container takes time to initialize, and then the bcrypt comparison adds another 200–800ms. Stacked with Neon cold-start latency, login can hit the 10-second timeout under adverse conditions. More commonly, logins feel slow to first-time users.

**Why it happens:**
bcryptjs is recommended over native bcrypt for Vercel/Edge compatibility. But bcryptjs is pure JavaScript and slower than the native C++ binding. A work factor of 12 can take 400ms+ in JS.

**How to avoid:**
- Use work factor 10 for bcryptjs on serverless (still secure, halves compute time vs. 12)
- bcryptjs is the right choice for this stack — do NOT use native `bcrypt` (it breaks on Vercel edge/serverless due to native bindings)
- Do NOT move password hashing to middleware (confirmed broken in Next.js — see vercel/next.js#69002)
- Hash only in Server Actions or Route Handlers where Node.js runtime is guaranteed

**Warning signs:**
- Work factor set to 12 or higher with bcryptjs
- bcrypt (not bcryptjs) imported — will fail on Vercel deployment
- Password hashing happening in middleware.ts

**Phase to address:** Auth phase

---

### Pitfall 12: Auth.js v5 `auth()` Ignores the `session()` Callback

**What goes wrong:**
Custom fields added to the session in the `session()` callback (e.g., `session.user.role`, `session.user.githubConnected`) are visible when calling `useSession()` on the client but are NOT available when calling `auth()` in Server Components or Route Handlers. The server-side auth check sees an incomplete user object, causing null reference errors or broken permission checks.

**Why it happens:**
This is a documented but confusing Auth.js v5 behavior: `auth()` reads directly from the JWT payload (what `jwt()` callback returns), not from the `session()` callback output. The `session()` callback only transforms what `useSession()` sees.

**How to avoid:**
Put ALL required user fields (role, githubConnected, userId, etc.) in the `jwt()` callback, not the `session()` callback. The `session()` callback should only be used to selectively expose JWT fields to the client:

```ts
callbacks: {
  jwt({ token, user, account }) {
    if (user) token.role = user.role;           // set in jwt
    if (account?.provider === "github") {
      token.githubConnected = true;             // set in jwt
    }
    return token;
  },
  session({ session, token }) {
    session.user.role = token.role as string;  // expose to client via session
    session.user.githubConnected = token.githubConnected as boolean;
    return session;
  },
},
```

**Warning signs:**
- `session.user.role` returns `undefined` in Server Components but works in Client Components
- Custom fields visible in browser DevTools (via `useSession`) but missing in server-side `auth()` calls
- Middleware authorization checks pass but server-side data fetching fails with null errors

**Phase to address:** Auth phase

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip membership check in Server Actions, rely only on middleware | Faster to implement | Any Server Action becomes an IDOR vector; rewrites all access control | Never |
| Store GitHub token plaintext in accounts table | Zero extra code | Leaked DB = all user repos compromised | Never |
| Use `request.json()` then re-serialize for HMAC | Looks cleaner | HMAC always fails; webhooks silently broken | Never |
| Single global webhook secret for all projects | Simpler setup | One leaked secret compromises all projects' webhooks | Acceptable for MVP if secret is rotatable |
| No expiry on invite tokens | No cron job needed | Stale invites remain valid indefinitely | Acceptable for MVP if expiry is added in next phase |
| Work factor 10 instead of 12 for bcryptjs | Faster auth on cold starts | Marginally weaker (still very secure) | Acceptable on serverless |
| No idempotency key on webhook handler | Simpler handler | GitHub retries cause duplicate ticket state transitions | Never in production |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub Webhooks | Call `req.json()` before HMAC check | Call `req.text()` first; parse JSON from that string |
| GitHub Webhooks | Webhook route blocked by Auth.js middleware | Exclude `/api/webhooks/*` from middleware matcher |
| GitHub Webhooks | No idempotency check on retries | Store `X-GitHub-Delivery` header value; skip if already processed |
| Auth.js Drizzle Adapter | Default session strategy is "database", breaks Credentials | Explicitly set `session: { strategy: "jwt" }` |
| Auth.js `auth()` server-side | Reading `session.user.role` set in `session()` callback | Set all fields in `jwt()` callback; `auth()` reads from JWT not session callback |
| GitHub OAuth token | Exposing token to client via `session` callback | Keep token in JWT (server-only); use Server Actions for GitHub API calls |
| Neon HTTP | Using interactive transaction patterns (read-then-branch) | Use `UPDATE...RETURNING` single statements; batch non-interactive queries only |
| Vercel Hobby | Synchronous webhook processing hitting 10s timeout | Use `after()` for async processing; respond 200 immediately |
| dnd-kit | Updating server state on `onDragOver` (fires per pixel) | Update server only on `onDragEnd`; use local state for drag preview |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Neon cold start (free tier) on every serverless invocation | First request after idle takes 2-4s | Accept it; warm connections can't be guaranteed on hobby tier. Display loading states. | Always on free tier, every ~5min of idle |
| N+1 query on kanban board (fetch all tickets, then fetch assignee per ticket) | Board load time scales with ticket count | Use Drizzle `with` (eager load) to join assignees in one query | ~50+ tickets |
| bcryptjs on cold start serverless | Login takes 1-3s | Work factor 10; accept it; show loading state | Every cold start |
| Fetching full ticket list for every board rerender | Board feels slow after 100+ tickets | Paginate by status column; limit initial load | ~200+ tickets |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| IDOR — no project membership check on ticket API routes | Any authenticated user reads/modifies any project's data | `assertProjectMember(userId, projectId)` helper called at top of every scoped handler |
| GitHub token stored plaintext in `accounts` table | Leaked DB backup compromises all users' GitHub repos | Encrypt at-rest; store only server-side; never expose to client |
| Invite token with no expiry and no single-use flag | Token remains valid forever; can add unauthorized members | Set `expiresAt`; set `usedAt` on acceptance in same DB write |
| Plain string comparison for invite/webhook tokens | Timing attack reveals token validity | Use `crypto.timingSafeEqual()` for all token comparisons |
| Webhook endpoint inside Auth.js protected routes | GitHub cannot deliver webhooks; all deliveries fail | Exclude from middleware matcher; document as public route |
| GitHub access token in JWT session exposed to client | XSS or compromised dependency exfiltrates all GitHub tokens | Keep token in server-only JWT; never forward via session callback |
| No CSRF protection on Credentials sign-in | CSRF can trigger sign-in with attacker credentials | Auth.js v5 includes built-in CSRF protection for the sign-in endpoint; do NOT disable it or bypass it with custom fetch |
| Owner role not checked before destructive project operations (delete project, kick member) | Any project member can delete the project | Check `role === "owner"` in addition to membership; separate `assertProjectOwner()` helper |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Kanban card snaps back to original column for a moment after drop | Disorienting; looks like the drag failed | Use local `useState` for board order during drag; only sync to server on `onDragEnd`; keep local state until server confirms |
| "Connect GitHub" button shows for already-connected users | Confusing; user thinks connection failed | Gate UI on `session.user.githubConnected`; show connected state with disconnect option |
| Generic "Something went wrong" on Credentials sign-in failure | User doesn't know if email or password is wrong | Return specific (but not enumeration-leaking) errors — "Invalid credentials" is fine; avoid "Email not found" |
| Invite link shows no feedback after acceptance | User doesn't know if they joined or if the link expired | Redirect to project board with toast; handle expired/used token with clear error page |
| Webhook latency makes ticket status update feel delayed | User merges PR but ticket stays "In Review" for seconds | Show optimistic "webhook pending" state; do not make users think the GitHub integration is broken |

---

## "Looks Done But Isn't" Checklist

- [ ] **Webhook verification:** Handler returns 401 for invalid signatures AND returns 200 quickly for valid ones — verify both paths in tests
- [ ] **IDOR protection:** Every API route that accepts a `projectId` or `ticketId` in the URL joins against `project_members` — grep for `eq(tickets.id, ticketId)` without a corresponding membership join
- [ ] **JWT session fields:** Fields set in `jwt()` callback are readable via `auth()` in Server Components — not just via `useSession()` in Client Components
- [ ] **Invite token expiry:** Expired tokens return a user-facing error, not a generic 500 — test with a token that expired yesterday
- [ ] **Invite token single-use:** Accepting an invite twice returns an error on the second attempt — the token must be invalidated in the same transaction as the membership insert
- [ ] **Ticket counter uniqueness:** Add a unique constraint on `(projectId, counter)` in the Drizzle schema — the atomic UPDATE prevents duplicates but the constraint prevents schema drift
- [ ] **Credentials + JWT session strategy:** The auth config explicitly sets `session: { strategy: "jwt" }` — removing this line silently breaks email/password login
- [ ] **GitHub token server-side only:** `session` callback does NOT include `accessToken` or any GitHub token field — grep for `session.accessToken` in client components
- [ ] **Middleware matcher excludes webhooks:** `config.matcher` in `middleware.ts` explicitly excludes `/api/webhooks` — confirm with a test that sends a webhook request without a session cookie
- [ ] **bcryptjs (not bcrypt):** Package.json imports `bcryptjs`, not `bcrypt` — native bcrypt breaks on Vercel serverless

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| IDOR discovered post-launch | HIGH | Audit all API routes; add membership joins; review access logs for suspicious cross-tenant queries; notify affected users |
| GitHub tokens exposed plaintext, DB leaked | HIGH | Immediately revoke all GitHub OAuth app authorizations; force re-connect for all users; implement encryption before re-launch |
| Duplicate ticket counters from race condition | MEDIUM | Add unique constraint (will surface existing duplicates); renumber duplicates with a migration; move to atomic UPDATE pattern |
| Webhook route blocked by middleware | LOW | Add middleware matcher exclusion; redeploy; replay failed webhooks from GitHub delivery history |
| Invite tokens never expiring | LOW | Add migration to set `expiresAt` on existing tokens; deploy single-use check; no user notification needed |
| Auth.js session fields missing server-side | LOW | Move field assignment from `session()` to `jwt()` callback; no data migration needed |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Auth.js Credentials + adapter JWT strategy | Auth | Test: email/password sign-in returns a valid session |
| GitHub token server-side only | Auth | Test: `useSession()` response does not contain `access_token` |
| bcryptjs (not bcrypt), work factor 10 | Auth | Package.json audit; test login response time < 3s |
| JWT `jwt()` callback vs `session()` callback | Auth | Test: `auth()` in Server Component returns `role` and `githubConnected` |
| CSRF — do not disable Auth.js CSRF protection | Auth | Do not touch CSRF config; document as protected |
| IDOR — project membership check | Projects/Invites | Test: user B cannot GET/PATCH/DELETE any resource in user A's project |
| Invite token entropy, expiry, single-use | Projects/Invites | Test: expired token returns 410; used token returns 410; token is 64+ hex chars |
| Owner-only operations (delete project) | Projects/Invites | Test: member role receives 403 on delete/kick endpoints |
| Ticket counter race condition (atomic UPDATE) | Tickets/Board | Test: concurrent ticket creation returns unique counters; unique constraint exists |
| neon-http non-interactive transaction limits | Tickets/Board | Document any multi-query operation; avoid interactive patterns |
| dnd-kit optimistic update snap-back | Tickets/Board | Manual test: drag card; verify no visual snap-back before server confirms |
| Raw body consumed before HMAC | GitHub Integration | Test: valid signature accepted; tampered body rejected |
| Webhook middleware exclusion | GitHub Integration | Test: POST to `/api/webhooks/github` without session returns non-401 |
| Vercel 10s timeout on webhook | GitHub Integration | Test: handler responds 200 in < 500ms; use `after()` for DB work |
| Webhook idempotency | GitHub Integration | Test: replaying same delivery ID does not double-update ticket status |
| GitHub token encrypted at rest | GitHub Integration | Audit: `accounts` table `access_token` column is not plaintext |

---

## Sources

- Auth.js v5 Credentials provider official docs: https://authjs.dev/getting-started/authentication/credentials
- Auth.js v5 migration guide (session strategy, adapter): https://authjs.dev/getting-started/migrating-to-v5
- NextAuth Credentials + database session bug: https://github.com/nextauthjs/next-auth/issues/9636
- NextAuth `auth()` ignores `session()` callback issue: https://github.com/nextauthjs/next-auth/issues/9122
- Neon serverless driver HTTP limitations: https://neon.com/docs/serverless/serverless-driver
- Neon transactions API (non-interactive): https://deepwiki.com/neondatabase/serverless/2.4-transactions-api
- Drizzle ORM atomic increment guide: https://orm.drizzle.team/docs/guides/incrementing-a-value
- Next.js App Router webhook raw body (Stripe pattern): https://kitson-broadhurst.medium.com/next-js-app-router-stripe-webhook-signature-verification-ea9d59f3593f
- Webhook route excluded from Auth.js middleware: https://webhooks.cc/blog/nextjs-app-router-webhook-handler
- IDOR prevention in Next.js: https://www.freecodecamp.org/news/prevent-idor-in-nextjs
- bcrypt vs bcryptjs on Vercel: https://github.com/vercel/next.js/issues/69002
- Vercel Hobby 10s timeout and `after()`: https://vercel.com/docs/functions/configuring-functions/duration
- dnd-kit optimistic update snap-back (React Query + dnd-kit): https://github.com/clauderic/dnd-kit/discussions/1522
- Token entropy and single-use enforcement: https://cyberleveling.com/blog/entropy-cryptography-web-authentication-tokens
- PostgreSQL single UPDATE RETURNING atomicity: https://oneuptime.com/blog/post/2026-01-25-postgresql-race-conditions/view
- GitHub OAuth token storage best practices: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app
- Next.js `after()` for background work post-response: https://nextjs.org/docs/app/building-your-application/routing/middleware

---
*Pitfalls research for: Multi-tenant Linear-style ticket system with GitHub integration*
*Researched: 2026-06-01*
