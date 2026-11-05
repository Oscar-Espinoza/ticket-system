# SvelteKit migration reference

Researched 2026-11-04 against the published packages (SvelteKit 3.1.1, Svelte 5.57.3, bits-ui 2.20.5, @dnd-kit/svelte 0.5.3, svelte-tiptap 3.0.2, Better Auth 1.6.33). **Where a section and the verification at the end disagree, the verification wins.** Builders: follow this literally; do not rely on memory of SvelteKit 2.



---

<!-- section: research:kit -->

# SvelteKit 3.x core reference (verified against @sveltejs/kit 3.1.1)

## 0. Versions and requirements (from the published package.json)
- `@sveltejs/kit@3.1.1` (2026-10-29). 3.0.0 shipped 2026-10-01 and 3.1.0 on 2026-10-14.
- Peer dependencies: `vite ^8.0.12`, `svelte ^5.57.1`, `@sveltejs/vite-plugin-svelte ^7.0.0`, and `typescript ^6.0.0` (optional). Engines: `node >=22.17`.
- Adapters: `@sveltejs/adapter-node@6.0.1`, `@sveltejs/adapter-vercel@7.0.2`, `@sveltejs/adapter-auto@8.0.0`. `svelte-check@4.7.8` accepts TypeScript `^5 || ^6`.
- There is an automatic migration: `npx sv migrate sveltekit-3`.

## 1. Breaking changes from 2.x to 3.0 (apply all of them)
- **`svelte.config.js` and `svelte.config.ts` are no longer supported.** If either file exists, the build errors (`config_file_unsupported`). All config now goes into `sveltekit({...})` in `vite.config.ts`. The old `kit.*` keys become top-level plugin options. Svelte options such as `compilerOptions`, `preprocess` and `extensions` go in the same object. `vitePlugin` is removed, so pass vite-plugin-svelte options directly.
- **`$lib` is replaced by `#lib`.** Declare it in package.json `imports`. Imports need explicit file extensions (`#lib/foo.js`). `files.lib` is removed.
- **Removed modules:** `$app/stores` (use `$app/state`), `$service-worker`, `@sveltejs/kit/node/polyfills`.
- **Deprecated but still working** (to be removed in 4): `$app/environment` (now `$app/env`) and `$env/{static,dynamic}/{private,public}`. These are now only thin aliases of `$app/env/private` and `$app/env/public`, so **only variables declared in `src/env.ts` are exposed** (see §9).
- **Types moved:**
  - `Handle`, `HandleServerError`, `HandleClientError`, `HandleFetch`, `ServerInit`, `ClientInit`, `Reroute`, `Transport` and `sequence` are now in `@sveltejs/kit/hooks`.
  - `ActionResult` and `SubmitFunction` are in `$app/forms`.
  - `Page`, `ReadonlyURL` and `ReadonlyURLSearchParams` are in `$app/state`.
  - `Navigation*`, `BeforeNavigate`, `AfterNavigate`, `OnNavigate` and `GotoOptions` are in `$app/navigation`.
  - The `Remote*` types are in `$app/server`.
  - `defineEnvVars` and `EnvVarConfig` are in `@sveltejs/kit/env`.
  - `defineParams` is in `@sveltejs/kit/params`.
- **tsconfig:** extend `$app/tsconfig`, which is written to `node_modules/$app/tsconfig.json`, not `./.svelte-kit/tsconfig.json`.
- **`$app/paths`:** `base`, `assets` and `resolveRoute` are removed. Use `resolve()` and `asset()`. Pathnames and assets **no longer start with `/`**: write `asset('foo.png')` and `resolve('blog/x')`. Only route IDs start with `/`.
- **Navigation:**
  - `goto`: `noScroll` and `keepFocus` become `reset: false`, `replaceState` becomes `replace`, and `invalidateAll` becomes `refreshAll`.
  - `goto` now **rejects** for URLs that are not app routes. For external URLs use `window.location.href = url`.
  - `pushState` and `replaceState` are deprecated in favour of `goto(url, { shallow: true, state })`.
  - `invalidateAll()` is deprecated in favour of `refreshAll()`, which keeps `page.state`.
  - `preloadData` can return `{ type: 'error' }`. `preloadCode` now takes a **route ID**.
  - `delta` is only present on `popstate` navigations.
  - Clicking a link to the current URL now runs `refreshAll()`.
  - `data-sveltekit-noscroll` and `-keepfocus` become `data-sveltekit-reset="false"`. The value `'off'` becomes `false`.
- **Errors:**
  - `App.Error` always has `status`.
  - `error(status, message, extraProps)`. The old `error(status, {...})` form is deprecated.
  - **Every** error, including expected ones, goes through `handleError`, which receives `kind: 'app' | 'framework' | 'validation' | 'unknown'`. Returning `status` from it changes the HTTP status.
  - `handleValidationError` is removed. Rendering errors go to the nearest `+error.svelte`, which is now an automatic `<svelte:boundary>`.
- **Form actions:**
  - Enhanced responses use the status passed to `fail()`; they no longer always return 200.
  - A `use:enhance` form whose `action` is on another page now navigates to that page.
- **Cookies:** cookie v2 (names must be ASCII). The default `path` is `'/'`. `secure` defaults to false only in dev.
- **Security:**
  - `csrf.checkOrigin` is removed; use `csrf.trustedOrigins` (`['*']` disables the check).
  - Cross-origin mutating requests without a `Content-Type` are rejected.
  - External `redirect()` now needs `{ external: true | string[] }`.
  - `prerender.origin` and adapter-node's `ORIGIN` env var are replaced by `paths.origin`.
- **Server-only modules:** any filename with a `server` segment (regex `[/.]server\.[^/]+$`, so `server.ts`, `x.server.ts` and `x.server.test.ts`). Also **any** `server/` directory anywhere except `src/routes` and `static`.
- **Param matchers:** declared in a single `src/params.ts` with `defineParams`. The `src/params/` directory is gone.
- **Other:**
  - 204 and other empty-2xx responses now have no body.
  - `resolve` in `handle` is typed as `Promise<Response>`.
  - `getRequest` and `setResponse` are synchronous.
  - `version.pollInterval` now defaults to 1 hour, and `updated.current` updates on its own.
  - `output.preloadStrategy` is removed; `output.linkHeaderPreload` is new and defaults to false.
  - `tracing.server` is now top-level, and `src/instrumentation.server.ts` is picked up automatically.
  - Universal `config` exports take precedence over server ones.
  - The service worker is registered as `type: 'module'`.

**What 3.1.x adds:** CSP `report-sha256`, `report-sha384` and `report-sha512`, plus a `sveltekit.endpoint` tracing span (3.1.0). 3.1.1 is fixes only: `query.batch` isolation, linear-time remote form parsing, and server-only enforcement for `src/params`.

## 2. Project files
```ts
// vite.config.ts
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter(),
      compilerOptions: {
        runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
        experimental: { async: true } // needed for remote functions / `await` in components
      },
      experimental: { remoteFunctions: true },
      alias: { '@': 'src' }, // deprecated (warns) — see §3
      csrf: { trustedOrigins: [] }
      // paths: { origin: 'https://tickets.example.com' } // BUILD-TIME constant
    })
  ]
});
```
- `sveltekit(config?: Config): Promise<Plugin[]>` comes from `@sveltejs/kit/vite`.
- Options SvelteKit doesn't use are forwarded to vite-plugin-svelte.
- `preprocess: vitePreprocess()` (from `@sveltejs/vite-plugin-svelte`) is only needed for `lang="scss"`/PostCSS and similar. The sv template omits it.

```jsonc
// package.json
{
  "type": "module",
  "imports": { "#lib": "./src/lib/index.js", "#lib/*": "./src/lib/*" },
  "scripts": {
    "dev": "vite dev", "build": "vite build", "preview": "vite preview",
    "prepare": "svelte-kit sync || echo ''",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json"
  }
}
```
```jsonc
// tsconfig.json
{ "extends": "$app/tsconfig", "compilerOptions": { "strict": true },
  "include": ["src", "vite.config.ts", "tests"], "exclude": ["src/service-worker"] }
```
- `$app/tsconfig` enforces `verbatimModuleSyntax` and `isolatedModules`. It sets `moduleResolution: bundler`, `allowImportingTsExtensions`, `noEmit`, `paths` (from `alias`) and `types: ["$app/types"]`. It sets **no** `include` or `exclude`, so you must provide them.
- Do **not** override `paths`. If you set `types`, it must contain `"$app/types"`. SvelteKit warns about both.
- `node_modules/$app/*` is generated, so run `svelte-kit sync` before `tsc` or `svelte-check` in CI.

```html
<!-- src/app.html -->
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />%sveltekit.head%</head>
  <body data-sveltekit-preload-data="hover"><div style="display: contents">%sveltekit.body%</div></body>
</html>
```
Placeholders: `%sveltekit.assets%`, `%sveltekit.nonce%`, `%sveltekit.version%`, and `%sveltekit.env.NAME%` (NAME must be a **public** variable from `src/env`). `src/error.html` supports `%sveltekit.status%` and `%sveltekit.error.message%`.

```ts
// src/app.d.ts
declare global {
  namespace App {
    interface Error { code?: string }           // status + message are built in
    interface Locals { user: { id: string } | null }
    interface PageData {}
    interface PageState { modalId?: string }
    interface Platform {}
  }
}
export {};
```
If you add *required* fields to `App.Error`, `handleError` must return them.

## 3. Aliases: `@` mapped to `src`
- Package.json subpath imports must start with `#`, so `@` is only possible through the **deprecated** top-level `alias` option. Write `sveltekit({ alias: { '@': 'src' } })`, not `kit.alias` (there is no `kit` namespace in 3.x).
- That generates tsconfig `paths` for `@` and `@/*`, plus a Vite alias. It logs a deprecation warning.
- Extensionless imports like `@/lib/x` keep working through tsconfig `paths`.
- The non-deprecated alternative is `"imports": { "#src/*": "./src/*" }`, used with extensions (`#src/lib/x.js`).
- To keep `$lib`, use `alias: { '$lib': 'src/lib' }`; the build error message itself suggests this.

## 4. Routing (same filesystem model as 2.x)
- **Files:**
  - `+page.svelte`, `+page.ts` (universal load), `+page.server.ts` (server load and `actions`).
  - `+layout.svelte`, `+layout.ts`, `+layout.server.ts`.
  - `+error.svelte`.
  - `+server.ts`, which exports `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`, `QUERY` (new) and `fallback`.
- **Path segments:** `[param]`, `[[optional]]`, `[...rest]`, `[id=matcher]` and `(group)/`. Break out of a layout with `+page@(group).svelte` or `+page@.svelte`.
- Files like `+page.test.ts`, `+x.spec.ts` and `+x.stories.svelte` are ignored.
- **Generated props** from `./$types`:
  - `PageProps = { params, data, form }`
  - `LayoutProps = { params, data, children }`
  - `ErrorProps = { error: App.Error }`
- **Matchers:**
```ts
// src/params.ts
import { defineParams } from '@sveltejs/kit/params';
export const params = defineParams({ ticketId: (p) => (/^\d+$/.test(p) ? p : undefined) });
```
A matcher can be a Standard Schema or a function that returns the parsed value or `undefined`.

## 5. Load functions
```ts
// src/routes/tickets/[id]/+page.server.ts
import { error, redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '#lib/server/db.js';

export const load: PageServerLoad = async ({ params, locals, depends, setHeaders, parent, cookies }) => {
  if (!locals.user) redirect(303, '/login');
  depends('app:ticket');                       // custom id must match /[a-z]+:/
  const ticket = await db.ticket(params.id);
  if (!ticket) error(404, 'Ticket not found');
  setHeaders({ 'cache-control': 'private, max-age=0' });
  const comments = db.comments(params.id); comments.catch(() => {}); // streamed; avoid unhandled rejection
  return { ticket, comments };                  // top-level promise streams (server load only)
};
```
- Use `{#await data.comments}` in the page.
- `parent()` returns parent load data. Call it after your own fetches to avoid waterfalls.
- `untrack(fn)` opts out of dependency tracking.
- You cannot call `setHeaders` or `redirect` inside a streamed promise. `setHeaders` cannot set `set-cookie`; use `cookies.set(name, value, opts)`.
- Re-run loads with `invalidate('app:ticket')`, `invalidate(url => ...)` or `refreshAll()`.
- Universal loads do not stream promises.

## 6. Form actions and `use:enhance`
```ts
export const actions = {
  close: async ({ request, params }) => {
    const reason = (await request.formData()).get('reason');
    if (typeof reason !== 'string' || !reason) return fail(400, { missing: true }); // HTTP 400 now
    await db.close(params.id, reason);
    return { closed: true };
  }
} satisfies Actions;
```
```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
</script>
<form method="POST" action="?/close"
  use:enhance={({ formData, cancel, submitter }) => async ({ result, update }) => {
    await update({ reset: false });  // options: reset, refreshAll, navigate:false
  }}>
```
`applyAction(result)` and `deserialize(text)` are also exported from `$app/forms`.

## 7. Remote functions (**still experimental in 3.x**)
- **Enable:** set **both** `experimental: { remoteFunctions: true }` and `compilerOptions: { experimental: { async: true } }`. Without the flag, any `*.remote.ts` or `remote.ts` file is a build error.
- **Where they live:** a remote module is any file with a `remote` segment, anywhere under `src` **except inside a `server/` directory**.
- **Export rules:** only named exports, and every export must be a remote function. You cannot export schemas or other values from a remote module.
- **Where they can be called:** from any component or client module. Queries can be awaited in components, event handlers and universal `load`.
- **Commands** cannot be called during render or SSR, or inside a query.
- **Not allowed:** queries on fully prerendered pages.
```ts
// src/lib/tickets.remote.ts
import * as v from 'valibot';
import { error, invalid } from '@sveltejs/kit';
import { query, command, form, prerender, getRequestEvent, requested } from '$app/server';
import { db } from '#lib/server/db.js';

export const getTickets = query(v.object({ status: v.string() }), async ({ status }) => {
  const { locals } = getRequestEvent();           // event.url/params/route THROW inside queries
  if (!locals.user) error(401, 'Unauthorized');
  return db.tickets(status);
});
export const getTicket = query.batch(v.string(), async (ids) => {   // n+1 batching per macrotask
  const map = new Map((await db.ticketsByIds(ids)).map((t) => [t.id, t]));
  return (id) => map.get(id);
});
export const addComment = command(v.object({ id: v.string(), body: v.string() }), async ({ id, body }) => {
  await db.addComment(id, body);
  void getTicket(id).refresh();                   // single-flight: result rides back with the command
});
export const createTicket = form(
  v.object({ title: v.pipe(v.string(), v.nonEmpty()), urgent: v.optional(v.boolean(), false), _secret: v.optional(v.string()) }),
  async (data, issue) => {
    if (await db.exists(data.title)) invalid(issue.title('Duplicate title')); // NOT fail()
    const t = await db.create(data);
    await requested(getTickets, 5).refreshAll();  // honour client-requested refreshes (limit required)
    return { id: t.id };
  }
);
export const getStatuses = prerender(async () => db.statuses()); // options: { inputs, dynamic }
```
- **Signatures:**
  - `query(fn)`, `query(schema | 'unchecked', fn)`.
  - `query.batch(schema, (args[]) => (arg, idx) => out)`.
  - `query.live(schema?, async function*)`, which exposes `.connected`, `.reconnect()` and `for await`.
  - `command(schema?, fn)`, `form(schema?, (data, issue) => out)`, `prerender(schema?, fn, { inputs, dynamic })`.
  - `requested(queryFn, limit)` returns `{ arg, query, ignore }` entries plus `.refreshAll()` and `.ignoreAll()`.
- **Validation:** Standard Schema, or `'unchecked'` to skip it. A failed argument validation returns a generic 400 and calls `handleError` with `kind: 'validation'` and `issues`.
- **Form checkbox booleans** must have a default, e.g. `v.optional(v.boolean(), false)`; a plain `v.boolean()` is a type error.
```svelte
<script lang="ts">
  import { getTickets, createTicket, addComment, getTicket } from '#lib/tickets.remote.js';
  const tickets = getTickets({ status: 'open' });   // same args → same cached instance
</script>
<svelte:boundary>
  {#each await tickets as t (t.id)}<li>{t.title}</li>{/each}
  {#snippet pending()}<p>Loading…</p>{/snippet}
  {#snippet failed(error)}<p>{error.message}</p>{/snippet}
</svelte:boundary>

<form {...createTicket.enhance(async (f) => {
  const ok = await f.submit().updates(tickets.withOverride((list) => [...list, optimistic]));
  if (ok) f.element.reset();                       // enhance does NOT auto-reset
})}>
  <input {...createTicket.fields.title.as('text')} />
  {#each createTicket.fields.title.issues() ?? [] as i}<p>{i.message}</p>{/each}
  <input {...createTicket.fields.urgent.as('checkbox')} />
  <button disabled={createTicket.pending > 0}>Create</button>
</form>
{#if createTicket.result?.id}Created{/if}
<button onclick={() => addComment({ id, body }).updates(getTicket(id))}>Comment</button>
```
- **Query resource API:** `await q`, `.current`, `.ready`, `.loading`, `.error` (typed `App.Error | undefined`), `.refresh()`, `.set(v)`, `.withOverride(fn)`.
- **Form API:** `{...form}` spread, `.fields.x.as(type, value?, checked?)`, `.value()`, `.set()`, `.issues()`, `.allIssues()`, `.dirty()`, `.touched()`, `.validate({ all, preflightOnly })`, `.preflight(schema)`, `.for(id)`, `.result`, `.pending`, `.submitted`, `.submit()`.
  - **Gotcha:** the d.ts uses `validate({ all })`, but the docs text says `includeUntouched`. The runtime reads `all`.
  - **Gotcha:** inputs without `.as(...)`, such as a bare `name="x"`, cause the submission to be rejected.
  - Field names starting with `_` are never echoed back to the client.
  - Files need `enctype="multipart/form-data"`.
- **Default refresh behaviour:** after success, a `form` refreshes all queries and loads, unless the handler calls `refresh`, `set` or `reconnect`. A `command` refreshes nothing.
- **Client-requested updates** (`.updates(...)`) must be refreshed, set or ignored on the server; otherwise that query errors with "Requested update was not handled". A server-side `refresh()` of the same key counts as handled.
- **Client errors:** a failed command rejects. Check it with `isHttpError(e)` from `@sveltejs/kit` and read `e.body` (an `App.Error`).
- **Restrictions inside remote functions:**
  - `setHeaders` is forbidden.
  - Cookies can only be written in `form` and `command` functions, and need absolute paths.
  - `redirect()` works in `query`, `form` and `prerender`, but not in `command`.
  - `fail()` is not allowed in a remote form; use `invalid()`.
- **CSRF:** non-GET remote calls must exactly match the self-origin. `trustedOrigins` is **not** honoured for them.

## 8. Hooks
```ts
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleServerError, HandleFetch, ServerInit } from '@sveltejs/kit/hooks';
export const init: ServerInit = async () => { await db.connect(); };
const auth: Handle = async ({ event, resolve }) => {
  event.locals.user = await db.session(event.cookies.get('sid'));
  return resolve(event, { filterSerializedResponseHeaders: (n) => n === 'content-type' });
};
export const handle = sequence(auth);
export const handleFetch: HandleFetch = ({ request, fetch }) => fetch(request);
export const handleError: HandleServerError = ({ kind, error, event, issues }) => {
  if (kind !== 'unknown') return;                  // keep defaults for app/framework/validation
  console.error(error);
  return { message: 'Internal Error' };            // status optional
};
```
- **Is `init` awaited before requests are served? Yes.** The runtime memoizes `init()` and awaits it before responding:
  - adapter-node: `await server.init()` at the top level of `handler.js` runs **before `listen`**.
  - `vite dev`: awaited before each request.
  - adapter-vercel: awaited on every request.
  - In production, if `init` throws, startup fails.
  - In `hooks.client.ts`, an async `init` delays hydration.
- **Client hooks:** `src/hooks.client.ts` exports `handleError: HandleClientError` (`event` is a `NavigationEvent`; no `'validation'` kind) and `init: ClientInit`. An async client `handleError` requires `compilerOptions.experimental.async`.
- **Universal hooks:** `src/hooks.ts` exports `reroute: Reroute = ({ url, fetch }) => string | void`, which may be async and must be pure, and `transport: Transport = { Name: { encode: v => v instanceof X && [..], decode: ([..]) => new X(..) } }`.
- **Gotcha:** setting headers on a response with immutable headers (e.g. from `Response.redirect`) throws; clone the response first.

## 9. Environment variables
```ts
// src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';
import * as v from 'valibot';
export const variables = defineEnvVars({
  DATABASE_URL: { schema: building ? v.optional(v.string()) : v.pipe(v.string(), v.url()), description: 'Postgres URL' },
  API_BASE: { public: true },                                    // → $app/env/public, no PUBLIC_ prefix needed
  SHOW_DEBUG: { public: true, static: true, schema: v.pipe(v.optional(v.string(), ''), v.transform((s) => s !== '')) }
});
```
- Import with `import { DATABASE_URL } from '$app/env/private'` (server-only) and `import { API_BASE } from '$app/env/public'`.
- Default is dynamic: the value is read when the app starts. `static: true` inlines the value at build time.
- An invalid value stops startup or the build.
- `.env` and `.env.local` are loaded only in dev and build. For production use `node --env-file=.env build`.
- `$app/env` exports `browser`, `dev`, `building` and `version`.

## 10. `$app/state` and `$app/navigation`
```svelte
<script lang="ts">
  import { page, navigating, updated } from '$app/state';
  import { goto, refreshAll, invalidate, preloadData, preloadCode, beforeNavigate, afterNavigate, onNavigate, snapshot } from '$app/navigation';
  import { resolve, asset, match } from '$app/paths';
  const id = $derived(page.params.id);              // page.url is readonly: copy with new URL(page.url.href)
  beforeNavigate((n) => { if (dirty && !n.shallow) n.cancel(); });
  onNavigate((n) => new Promise((r) => document.startViewTransition?.(async () => { r(); await n.complete; })));
  const open = (tid: string) => goto(resolve('/tickets/[id]', { id: tid }), { replace: false, reset: true, refreshAll: false });
  const modal = (tid: string) => goto('', { shallow: true, state: { modalId: tid } }); // page.state / page.shallow
</script>
{#if navigating.to}<Spinner />{/if}   <!-- navigating fields are null when idle; the object itself is never null -->
{#if updated.current}<button onclick={() => location.reload()}>New version</button>{/if}
```
- Also available: `GotoOptions.invalidate`, `persistState`, and `snapshot({ id?, capture, restore, reset? })`, which replaces `export const snapshot`.
- On the server, `page` can only be read during render.

## 11. Server-only modules
- `#lib/server/**`, any `server/` directory outside `src/routes`, `*.server.ts`, `server.ts`, `$app/env/private` and `$app/server` cannot be imported into client code, even indirectly.
- Type-only imports are fine with `import type`.
- `node_modules` is exempt; a package can opt in by adding `import '$app/server'`.
- The check is disabled when `process.env.TEST === 'true'` (Vitest).

## 12. Streaming and SSE from `+server.ts`
```ts
import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ request }) => {
  const enc = new TextEncoder(); let t: ReturnType<typeof setInterval>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(`event: hello\ndata: {"ok":true}\n\n`));
      t = setInterval(() => c.enqueue(enc.encode(': ping\n\n')), 15000);
      request.signal.addEventListener('abort', () => { clearInterval(t); try { c.close(); } catch {} });
    },
    cancel() { clearInterval(t); }
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
};
```
- `request.signal` aborts when the client disconnects, since 3.0, when `getRequest` gets `response`; adapter-node and dev both pass it.
- Use adapter-node **≥ 6.0.1**, which fixes a crash on `text/event-stream` responses with immutable headers.
- Never cache `no-store` responses in the service worker.
- `query.live` is a remote-function alternative to SSE.
- `json()` and `text()` are deprecated; use `Response.json()` and `new Response()`.

## 13. Body size and CSRF
- **Body size:**
  - Enforced in `getRequest({ bodySizeLimit })`. adapter-node reads `BODY_SIZE_LIMIT` (default `512K`; accepts K/M/G or `Infinity`), and an oversized body fails with 413.
  - Since 3.0 the limit is also enforced when `Content-Type` is absent.
  - `vite dev` and `vite preview` apply **no** limit.
- **CSRF:**
  - Only checked in production, including `vite preview`.
  - Applies to form content types or a missing content type on POST, PUT, PATCH and DELETE. The `Origin` header must equal `paths.origin || url.origin`, or be listed in `trustedOrigins`.

## 14. adapter-node 6
- **Options:** `adapter({ out: 'build', precompress: true, envPrefix: '' })`.
- **Build output:** `build/index.js`, `handler.js`, `adapter-node.js`, `server/`, `client/` and `prerendered/`.
- **Running it:** `node build` (or `node --env-file=.env build`). You need `build/`, `package.json` and production `node_modules`.
- **Bundling:** uses Rolldown. devDependencies are bundled; `dependencies` are externalized.
- **Runtime env vars:**

| Variable(s) | Purpose / default |
|---|---|
| `PORT`, `HOST`, `SOCKET_PATH` | Listen address; defaults `0.0.0.0` and `3000` |
| `PROTOCOL_HEADER`, `HOST_HEADER`, `PORT_HEADER` | Read the origin from proxy headers, e.g. `x-forwarded-proto` / `x-forwarded-host` |
| `ADDRESS_HEADER`, `XFF_DEPTH` | Client IP behind proxies |
| `BODY_SIZE_LIMIT` | Request body limit (see §13) |
| `SHUTDOWN_TIMEOUT` | Default 30 seconds |
| `IDLE_TIMEOUT` | Used with socket activation |
| `KEEP_ALIVE_TIMEOUT`, `HEADERS_TIMEOUT` | Node HTTP server timeouts |
| `LISTEN_PID`, `LISTEN_FDS` | systemd socket activation; never prefixed |

- **`ORIGIN` is removed.** `paths.origin` is a **build-time** constant: it is baked in at `vite build`, not read at runtime.
- **Gotcha:** without `paths.origin` or `PROTOCOL_HEADER`, the protocol defaults to **https**. Plain-HTTP deployments then get 403 "Cross-site POST form submissions are forbidden" or "Cross-site remote requests are forbidden".
- **Graceful shutdown:** on SIGTERM or SIGINT the server calls `close()` and `closeIdleConnections()`, then force-closes after `SHUTDOWN_TIMEOUT`. Hook cleanup into `process.on('sveltekit:shutdown', async (reason) => {...})`.
- **Static assets:** only files present at build time are served, only for GET and HEAD (other methods get 405), with content-hash ETags and no `Last-Modified`.
- **Custom server:** `import { handler } from './build/handler.js'` works as Express, Polka or Connect middleware. In that mode only the header-related variables and `BODY_SIZE_LIMIT` apply.

## 15. adapter-vercel 7
- **Config:** `adapter({ runtime?, regions?, split?, memory?, maxDuration?, isr?, images? })`, or per route with `export const config: import('@sveltejs/adapter-vercel').Config = {...}`.
- **Runtimes:** `nodejs22.x`, `nodejs24.x`, `nodejs26.x`, `bun1.x`. **The edge runtime and Node 20 are removed.**
- **ISR:** needs `expiration`. `bypassToken` must be at least 32 characters and is read at build time.

## 16. Service worker (PWA)
- **Entry point:** `src/service-worker/index.ts` (preferred) or `src/service-worker.ts`. It is auto-registered with `{ type: 'module' }`, bundled only in production, and can be turned off with `serviceWorker: { register: false }`.
- **Imports:** `self` from `$app/service-worker`, `version` from `$app/env`, `immutable`, `assets` and `prerendered` from `$app/manifest`, and `resolve` from `$app/paths`. Build cache URLs with `resolve(a.path)`.
- **tsconfig:** add `src/service-worker/tsconfig.json` containing `{ "extends": "$app/tsconfig/service-worker" }`, and exclude that folder in the root tsconfig.
- **Updates:** client-side navigation does not trigger SW update checks. Call `registration.update()` in `afterNavigate` if you want eager updates.

## 17. svelte-check
- Run `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`.
- Useful flags: `--threshold error`, `--fail-on-warnings`, `--output machine-verbose`, `--watch`, `--incremental`.
- It reads Svelte options from `vite.config` (`--config <path>` to override).
- TypeScript 7 only works via `--tsgo`, with TypeScript 6 installed alongside.

## UNVERIFIED
- Whether a top-level `await` in a component *requires* an enclosing `pending` boundary. That is Svelte core behaviour; the boundary in §7 is defensive.
- TypeScript 6 changing its default `types` to `[]`. Either way, list any extra types such as `"node"` in `types` next to `"$app/types"`.
- Vercel's platform request-body limit (thought to be 4.5 MB).
- Whether Vite 8 matches the string alias `'@'` only for `@` and `@/...` (and not `@scope/...`), inferred from plugin-alias semantics.

## Sources
- https://svelte.dev/docs/kit/llms.txt (full docs bundle; sections read: Project structure, Routing, Loading data, Form actions, Remote functions, Environment variables, Node servers, Vercel, Advanced routing, Hooks, Errors, Link options, Service workers, Server-only modules, Page state & shallow routing, Migrating to SvelteKit v3, `$app/env`, `$app/tsconfig`, `#lib`, CLI, deprecated modules)
- https://svelte.dev/docs/kit/migrating-to-sveltekit-3
- https://svelte.dev/docs/kit/remote-functions
- https://svelte.dev/docs/kit/hooks
- https://svelte.dev/docs/kit/environment-variables
- https://svelte.dev/docs/kit/adapter-node
- https://svelte.dev/docs/kit/adapter-vercel
- https://svelte.dev/docs/kit/service-workers
- https://svelte.dev/docs/kit/@sveltejs-kit-vite
- https://raw.githubusercontent.com/sveltejs/kit/main/packages/kit/CHANGELOG.md
- https://raw.githubusercontent.com/sveltejs/kit/main/packages/adapter-node/CHANGELOG.md
- https://raw.githubusercontent.com/sveltejs/kit/main/packages/adapter-vercel/CHANGELOG.md
- https://github.com/sveltejs/kit/pull/16382 (consistent special filename patterns)
- npm tarball `@sveltejs/kit@3.1.1`, read under /tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/research-kit3/x/sveltejs-kit-3.1.1/package/: package.json, types/index.d.ts, src/runtime/server/{index,instance,csrf,respond}.js, src/exports/vite/{index,utils}.js, src/exports/node/index.js, src/core/sync/write_tsconfig/*, src/core/config/options.js, src/runtime/env/*, src/runtime/client/remote-functions/{shared,form}.svelte.js, src/messages/*
- npm tarball `@sveltejs/adapter-node@6.0.1` (index.js, src/{index,handler,env}.js, index.d.ts)
- npm tarball `@sveltejs/adapter-vercel@7.0.2` (index.d.ts, package.json)
- npm tarball `sv@1.3.0` (dist/templates/minimal, the new-project template)
- npm tarball `svelte-check@4.7.8` (README, dist config loader)
- npm tarball `@sveltejs/vite-plugin-svelte@7.3.1` (types)
- npm registry dist-tags and publish times for kit, adapters, svelte, vite and typescript


---

<!-- section: research:svelte -->

# Svelte 5.57.3 reference for React 19 porters

Checked against the svelte@5.57.3 npm tarball (`types/index.d.ts`, `elements.d.ts`, `src/`), svelte.dev/docs/svelte/llms.txt (current docs) and the GitHub CHANGELOG. "since x.y" is the version that added the API. I did not execute the downloaded package, so runtime behaviour comes from the docs and the source. Anything I could not confirm is marked **UNVERIFIED**.

## 0. Ground rules (most common porting bugs)
- **Runes:** they are compiler keywords. You don't import them, and they only work in `.svelte`, `.svelte.ts` and `.svelte.js` files. A plain `.ts` file cannot use runes.
- **Script runs once:** a component's `<script>` runs once per instance and nothing re-renders. Only template expressions, `$derived` and `$effect` re-run.
- **`{false}` renders the text "false":** only `null` and `undefined` are omitted. Use `{#if}`.
- **Event attributes are case-sensitive:** write `onclick`. `onClick` listens for an event literally named "Click". For typing in text inputs, React's `onChange` is `oninput`; `onchange` only fires on commit.
- **JSX attribute names:** use `class` (not `className`), `for` (not `htmlFor`), and `{@html str}` (not `dangerouslySetInnerHTML`).
- **Styles:** `style` takes a string, or `style:prop={v}` / `style:--var={v}` directives. Style objects are not documented.
- **No fragments needed:** a component can have multiple root nodes.
- **SvelteKit 3 config:** `svelte.config.js` is no longer supported. `compilerOptions` go inside `sveltekit({...})` in `vite.config.ts`.

## 1. Runes

### `$state`, `$state.raw`, `$state.snapshot`, `$state.eager`
```ts
let count = $state(0);
let todos = $state<Todo[]>([]);   // deep proxy: todos.push(t) and todos[0].done = true are reactive
let rows = $state.raw<Row[]>([]); // not proxied: must reassign, e.g. rows = [...rows, r]
let n = $state<number>();         // number | undefined
const plain = $state.snapshot(todos); // plain clone, for structuredClone, libraries, logging
```
Gotchas:
- A proxy is not `===` to the original object (warning `state_proxy_equality_mismatch`).
- Destructuring a value gives you non-reactive copies.
- Class instances are not proxied.
- Use `$state.raw` for large API payloads that you only ever replace.
- `$state(someProp)` only captures the prop's initial value (warning `state_referenced_locally`).
- `$state.eager(v)` (since 5.41) shows the latest value immediately while async work is pending. It only matters with async mode.

### `$derived`, `$derived.by`
```ts
let total = $derived(items.reduce((s, i) => s + i.price, 0));
let visible = $derived.by(() => { const q = query.toLowerCase(); return items.filter(i => i.name.includes(q)); });
let { a, b } = $derived(split(x)); // each destructured name stays reactive
```
- `$derived` takes an **expression**, not a function. `$derived(() => x)` gives you a function.
- Deriveds are writable since 5.25: assigning overrides the value until a dependency changes. Declaring with `const` makes it read-only.
- The result is not deep-proxied.
- Writing state inside a derived throws `state_unsafe_mutation`.
- You cannot export a derived from a module (`derived_invalid_export`).

### `$effect`, `$effect.pre`, `$effect.root`, `$effect.tracking()`, `$effect.pending()`
```ts
$effect(() => {
  const id = setInterval(poll, intervalMs); // intervalMs is tracked
  return () => clearInterval(id);           // runs before each re-run and on destroy
});
```
- **Dependencies are automatic:** whatever state is read synchronously gets tracked. Reads after `await` or inside `setTimeout` are not. There is no deps array; use `untrack()` to exclude a read.
- **Timing:** runs after the DOM update, in a microtask (the source uses `queueMicrotask`), so before paint. It never runs during SSR, so don't wrap the body in `if (browser)`.
- **Where it can be created:** during component init or inside another effect, otherwise you get `effect_orphan`. Outside those, use `const destroy = $effect.root(() => {...})`.
- **`$effect.pre`** runs before the DOM updates that are scheduled after it.
- **Don't sync state inside effects.** Use `$derived` or function bindings. If an effect writes state it reads, you get `effect_update_depth_exceeded`.
- **Cancelling fetches:** `getAbortSignal()` from `'svelte'` (since 5.35) works inside an effect or derived.

### `$props`, `$props.id()`, `$bindable`
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  interface Props extends HTMLButtonAttributes { variant?: 'primary' | 'ghost'; children?: Snippet }
  let { variant = 'primary', class: className, children, ...rest }: Props = $props();
  const uid = $props.id(); // since 5.20; SSR-stable
</script>
<button {...rest} class={['btn', `btn-${variant}`, className]}>{@render children?.()}</button>
```
- **Allowed forms:** `let props = $props()` or one flat object pattern, used once, at the top level. Nested destructuring and computed keys are errors.
- **Reactivity:** destructured props are reactive, but values computed from them need `$derived`.
- **Don't mutate props.** Reassigning a prop is only a local, temporary override.
- **`$props.id()`:** only as a top-level variable initializer.
- **`$bindable`:** write `let { value = $bindable('') } = $props();`; the parent writes `<C bind:value={text} />`. If the prop has a fallback and the parent binds it, the parent must pass a value that is not `undefined`, or it is a runtime error.

### `$inspect`, `$host`
- `$inspect(a, b).with((type, a, b) => {...})` is dev-only; `type` is `'init'` or `'update'`.
- `$inspect.trace('label')` must be the first statement of an effect or `$derived.by` body.
- `$host()` only works in custom-element components, so ignore it.

## 2. Reactive classes and shared `.svelte.ts` state
```ts
// cart.svelte.ts
export class Cart {
  items = $state<Item[]>([]);
  total = $derived(this.items.reduce((s, i) => s + i.qty * i.price, 0));
  constructor(initial: Item[] = []) { this.items = initial; }
  add = (i: Item) => { this.items.push(i); }; // arrow function, so onclick={cart.add} keeps `this`
}
```
- `$state` and `$derived` fields compile to non-enumerable get/set accessors. That means `{...cart}` and `JSON.stringify(cart)` will not include them; add `toJSON()` if you need it.
- `this.x = $state(v)` is allowed as the first assignment to `x` in the constructor. For late init, write `count = $state() as number`.
- **Module state:** export a mutated object or class instance, never a binding you reassign:
  ```ts
  export const ui = $state({ sidebarOpen: false }); // OK: mutate ui.sidebarOpen
  // export let count = $state(0);                 // broken if reassigned; export getCount() instead
  ```
- Module state is shared across SSR requests and can leak between users. Per-user or per-request state belongs in context (§5).

## 3. Snippets (replace children, render props and slots)
```svelte
<!-- List.svelte -->
<script lang="ts" generics="T extends { id: string }">
  import type { Snippet } from 'svelte';
  let { items, row, empty, children }: {
    items: T[]; row: Snippet<[T, number]>; empty?: Snippet; children?: Snippet;
  } = $props();
</script>
{@render children?.()}
{#each items as item, i (item.id)}{@render row(item, i)}{:else}{@render empty?.()}{/each}

<!-- usage: snippets declared inside the component tag become props; any other content becomes `children` -->
<List items={tickets}>
  {#snippet row(t, i)}<div>{i + 1}. {t.title}</div>{/snippet}
  {#snippet empty()}<p>No tickets</p>{/snippet}
  <h2>Tickets</h2>
</List>
```
- `Snippet<[A, B]>` takes a **tuple** of parameters. Rest params are not supported.
- A snippet can only be called through `{@render}`, never from JS.
- You can't pass a `children` prop and also put content inside the tag.
- Snippets declared at the top level of the template can be referenced in `<script>`, for example in table column definitions.
- A snippet can be exported from `<script module>` if it doesn't reference instance state (since 5.5).
- `createRawSnippet` (from `'svelte'`) builds a snippet programmatically.

## 4. Attachments `{@attach}` (since 5.29) vs actions `use:`
```svelte
<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import { fromAction } from 'svelte/attachments';
  const autosize: Attachment<HTMLTextAreaElement> = (el) => {
    const ro = new ResizeObserver(() => fit(el)); ro.observe(el);
    return () => ro.disconnect();
  };
  const tooltip = (text: string): Attachment => (el) => { const t = tippy(el, { content: text }); return t.destroy; };
</script>
<textarea {@attach autosize}></textarea>
<button {@attach enabled && tooltip(label)}>?</button>   <!-- a falsy value means no attachment -->
<div {@attach fromAction(libAction, () => params)}></div>
```
- Attachments run inside an effect. If any state read in the factory call or the body changes, they tear down and set up again. For expensive setup, pass a getter and read it in a nested `$effect`.
- On a component, `{@attach}` becomes a symbol-keyed prop that is forwarded by `{...rest}` spread. `createAttachmentKey()` adds one programmatically.
- Actions (`use:fn={param}`) run once and do not re-run when the parameter changes. The docs prefer attachments.

## 5. Context
```ts
// ticket-context.ts (no runes, so a plain .ts file is fine)
import { createContext } from 'svelte';
export const [getTickets, setTickets, hasTickets] = createContext<TicketStore>();
```
Parent: `setTickets(new TicketStore(data));` Child: `const store = getTickets();`
- `createContext` (since 5.40) returns `[get, set, has]`. The `has` function was added in 5.57.0. `get` throws `missing_context` if no ancestor set it.
- All of these must be called synchronously during component init: not in handlers or effects, and with async mode not after an `await` (`set_context_after_init`).
- Store a reactive object, a class instance or a getter. If you reassign the variable you passed in, the link breaks. Pass primitives as `() => value`.
- The older `setContext(key, v)`, `getContext<T>(key)`, `hasContext` and `getAllContexts` still exist.

## 6. `svelte/reactivity`
```ts
import { SvelteMap, SvelteSet, SvelteDate, SvelteURL, SvelteURLSearchParams, MediaQuery, createSubscriber } from 'svelte/reactivity';
const selected = new SvelteSet<string>();           // selected.has(id) is reactive
const cache = new SvelteMap<string, Ticket>();      // getOrInsert / getOrInsertComputed since 5.57
const wide = new MediaQuery('min-width: 1024px', false); // .current; 2nd arg is the SSR fallback
```
- Values stored in `SvelteMap` and `SvelteSet` are not deeply reactive.
- `MediaQuery` adds the surrounding parentheses for you. Prefer CSS where possible, because the server can't know the real value and you risk a hydration flash.
- `svelte/reactivity/window` exports `innerWidth`, `innerHeight`, `scrollX`, `scrollY`, `online` and `devicePixelRatio`. Each has a `.current` that is `undefined` on the server.

**`createSubscriber`: the `useSyncExternalStore` replacement**
```ts
import { createSubscriber } from 'svelte/reactivity';
export function fromExternal<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T) {
  const track = createSubscriber((update) => subscribe(update)); // returning the cleanup unsubscribes
  return { get current() { track(); return getSnapshot(); } };
}
```
`start` is called once, the first time `current` is read inside an effect or the template. Cleanup runs when the last effect using it is destroyed. Reads outside a tracking context just return the snapshot.

## 7. Async Svelte and `<svelte:boundary>`
**Status in 5.57.3:** still **experimental** and opt-in. The docs say the flag goes away in Svelte 6. SvelteKit remote functions require it.
```ts
// vite.config.ts (SvelteKit 3)
sveltekit({ compilerOptions: { experimental: { async: true } } })
```
With the flag on, `await` works in three places: the top level of `<script>`, inside `$derived(...)`, and in markup.
```svelte
<!-- TicketView.svelte -->
<script lang="ts">
  import { getAbortSignal } from 'svelte';
  let { id }: { id: string } = $props();
  const ticket = $derived(await fetch(`/api/t/${id}`, { signal: getAbortSignal() }).then((r) => r.json()));
  const [a, b] = $derived(await Promise.all([loadA(id), loadB(id)])); // avoids an await_waterfall
</script>
<h1>{ticket.title}</h1>
<p>{await loadComments(id)}</p>

<!-- Parent: the boundary must be ABOVE the component whose <script> awaits -->
<svelte:boundary onerror={(e) => report(e)}>
  <TicketView {id} />
  {#snippet pending()}<Spinner />{/snippet}
  {#snippet failed(error, reset)}<p>Failed</p><button onclick={reset}>Retry</button>{/snippet}
</svelte:boundary>
```
- **Synchronized updates:** when a dependency changes, the UI keeps showing the old content until the new promise resolves (similar to a React transition).
- **`pending`** shows only on first load. After that, `$effect.pending()` gives the number of promises pending in the current boundary. `await settled()` resolves once an update and its async work are done.
- **Parallelism:** awaits in markup run in parallel. Sequential `$derived(await …)` lines in the script run one after another (warning `await_waterfall`).
- **Hydration:** `hydratable(key, fn)` from `'svelte'` stops the client from re-fetching during hydration. SvelteKit remote functions use it internally.
- **Restrictions:** no `await` inside `use:`, `transition:`, `animate:`, attachments or bindings. `flushSync` can't be called inside an effect. With the flag on, `{#if}`/`{#each}` blocks run before `$effect.pre` in the same component.
- **On the server:** a boundary that has a `pending` snippet renders only that snippet during SSR.
- **What boundaries catch (since 5.3, no flag needed):** errors during render and effects. They do **not** catch errors in event handlers, `setTimeout` or async code outside `await` expressions; use try/catch there.
- **SvelteKit 3:** render errors go through `handleError` to the nearest boundary, and every `+error.svelte` automatically gets one.

## 8. Events
- Write handlers as attributes: `<button onclick={fn}>`, the shorthand `{onclick}`, or spread them. `on:click` is deprecated and modifiers (`|preventDefault`) are gone, so call `e.preventDefault()` in the handler.
- For capture phase, write `onclickcapture`.
- `ontouchstart` and `ontouchmove` are passive. If you need a non-passive listener, use `on(el, 'touchmove', h, { passive: false })` from `'svelte/events'` inside an attachment.
- An element can't have the same attribute twice, so combine handlers into one. When you also spread props, put your handler **after** `{...rest}` and forward it: `onclick={(e) => { mine(e); rest.onclick?.(e); }}`.
- **Delegation:** `click`, `input`, `keydown`, `pointer*` and similar events are delegated to the app root. A manual `addEventListener` that calls `stopPropagation` breaks delegated handlers; use `on()` (it returns an `off` function). A `CustomEvent` you dispatch yourself needs `bubbles: true`.
- **Component events are callback props**, e.g. `onselect?: (t: Ticket) => void`. `createEventDispatcher` is deprecated.
- **Typing:** use `MouseEventHandler<HTMLButtonElement>`, `KeyboardEventHandler<T>` and friends from `'svelte/elements'`.

## 9. Bindings
- **Element bindings:** `bind:value`, `bind:checked`, `bind:group`, `bind:files`, `bind:open` on `<details>`, and the read-only dimension bindings (`bind:clientWidth`, `bind:offsetHeight`, …, measured with ResizeObserver).
- A number or range input gives a `number`, or `undefined` when empty.
- **Function bindings (since 5.9):** `bind:value={() => v, (x) => (v = x.trim())}`. Don't wrap the pair in parentheses (`bind_invalid_parens`). For a read-only binding, use `null` as the getter: `bind:clientWidth={null, setW}`. Function bindings also work on a component's bindable props.
- **Controlled inputs:** after calling the setter, `bind:value` resets the DOM to the getter's value (source: "Respect any validation in accessors"), so transforms and rejections stick. One-way `value={v} oninput=…` does **not** revert the DOM when you reject a change.
- **`bind:this`:** `undefined` until mount, so read it in an effect or handler. Use `$state` for the variable if the template reads it. On a component, `bind:this` gives you the instance's `export function`s.
- You can only bind to `$state` or props (`bind_invalid_value`).

## 10. Blocks
- `{#if c}…{:else if d}…{:else}…{/if}`
- `{#each items as item, i (item.id)}…{:else}empty{/each}`
  - The key must be unique; don't use the index.
  - To repeat n times: `{#each { length: n }, i}`.
  - Don't destructure an item you `bind:` into.
- `{#key value}…{/key}` destroys and recreates its contents when `value` changes (the React key-to-reset pattern). It is expensive.
- `{#await p}…{:then v}…{:catch e}{/await}`. During SSR only the pending branch renders.
- **Declaration tags (since 5.56):** `{const label = $derived(expr)}` and `{let draft = $state(v)}` can go anywhere in markup. `{@const}` is now legacy.
  - The docs say to use `$state`/`$derived` when the value should be reactive. The compiler source suggests a bare `{const x = expr}` is evaluated only once. **UNVERIFIED** at runtime.

## 11. Transitions and animations
```svelte
<script>
  import { fade, fly, slide, scale, blur, draw, crossfade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { prefersReducedMotion, Tween, Spring } from 'svelte/motion';
</script>
{#if open}<div transition:fly={{ y: 8, duration: prefersReducedMotion.current ? 0 : 150, easing: cubicOut }}>…</div>{/if}
{#each items as it (it.id)}<li animate:flip={{ duration: 200 }} in:fade out:slide>{it.name}</li>{/each}
```
- **Local vs global:** transitions are local by default. Add `|global` to also play when a parent block toggles.
- **Exit animations:** an element with an out transition stays in the DOM until it finishes, so there's no AnimatePresence equivalent to add.
- **Reduced motion:** transitions use the Web Animations API, so a CSS `prefers-reduced-motion` rule has no effect. Check `prefersReducedMotion.current` instead.
- **`animate:`** must be on an immediate child of a keyed each block.
- **Motion classes:** `new Tween(0, { duration })` and `new Spring(v)` expose `.target` and `.current`; `Tween.of(() => v)` follows a value.

## 12. Special elements
- `<svelte:window onkeydown={…} bind:innerWidth={w} />`
- `<svelte:document onvisibilitychange={…} {@attach a} />`
- `<svelte:body>`
- `<svelte:head><title>…</title></svelte:head>`

These four are top-level only, never inside a block or element. Use `<svelte:element this={tag}>` for a polymorphic `as` prop.

## 13. Utilities (`import { … } from 'svelte'`)
- `await tick()`: the DOM is up to date after it resolves.
- `untrack(() => x)`: read without tracking.
- `flushSync(fn?)`: applies updates synchronously and returns `fn`'s result.
- `settled()`
- `mount(Comp, { target, props, context?, intro? })`: returns the component's exports. Effects don't run until the next flush (call `flushSync()` in tests).
- `unmount(inst, { outro?: true }): Promise<void>`
- `hydrate`
- `onMount(fn)`: the returned cleanup only works if `fn` is synchronous.
- `onDestroy(fn)`

## 14. TypeScript
- **Generics:** `<script lang="ts" generics="T extends { id: string }, K extends keyof T">`
- **Type-only TS:** enums and constructor parameter properties need `vitePreprocess({ script: true })`.
- **tsconfig:** `verbatimModuleSyntax`, `isolatedModules`, target ≥ ES2015.
- **From `'svelte'`:** `Snippet<[A]>`, `Component<Props, Exports?, Bindings?>`, `ComponentProps<typeof X>`.
- **From `'svelte/elements'`:** `HTMLAttributes<HTMLDivElement>`, `HTMLButtonAttributes`, `HTMLInputAttributes`, `HTMLAnchorAttributes`, `SvelteHTMLElements['div']`, `ClassValue`, `*EventHandler<T>`.
- **Others:** `Attachment<E>` from `'svelte/attachments'`, `Action` from `'svelte/action'`.
- **Instance type:** `let inst: MyComponent;` (this form is from the docs).

## 15. Dynamic components
```svelte
<script lang="ts">
  import type { Component } from 'svelte';
  const icons: Record<Status, Component<{ class?: string }>> = { open: CircleIcon, closed: CheckIcon };
  let Icon = $derived(icons[status]);
</script>
<Icon class="size-4" />
{#each widgets as w}<w.component {...w.props} />{/each}
```
`<svelte:component>` is deprecated in runes mode. A component variable must be capitalised or use dot notation.

## 16. React 19 to Svelte 5 mapping

| React | Svelte 5 |
|---|---|
| `useState` | `let x = $state(v)`; `setX(f)` becomes `x = f(x)` or a deep mutation |
| `useReducer` | A class with methods, or `$state.raw` plus a `dispatch` (below) |
| `useMemo` | `$derived` / `$derived.by` |
| `useCallback` | A plain function (the script runs once, so identity is stable) |
| `useRef` (DOM) | `let el = $state<HTMLDivElement>()` with `bind:this={el}`, or an attachment |
| `useRef` (mutable value) | A plain `let` (non-reactive, lives as long as the instance) |
| `useEffect` + cleanup | `$effect(() => { …; return cleanup })`; for `[]` use `onMount`. Fetch data with async derived, `load` or a remote `query`, not effects |
| `useLayoutEffect` | `$effect` (after DOM update, before paint); `$effect.pre` for reads before the update |
| `useId` | `const id = $props.id()` |
| `createContext` / `useContext` | `createContext<T>()` from `'svelte'` (§5) |
| `useSyncExternalStore` | `createSubscriber` (§6) |
| `useTransition` | A `$state` pending flag; with async mode, synchronized updates plus `$effect.pending()` |
| `useOptimistic` | Override a writable `$derived`, roll back on error |
| `useActionState` | `onsubmit` plus `$state` result/pending; in SvelteKit, form actions with `use:enhance` or remote `form()` (`.pending`, `.result`). See the SvelteKit section |
| `useDeferredValue` | No direct equivalent. Async synchronized updates show previous UI until resolved; for heavy synchronous filters, debounce |
| `forwardRef` | `ref = $bindable(null)` plus `bind:this={ref}` (below) |
| `useImperativeHandle` | `export function focus(){}` in the child plus `bind:this` in the parent |
| `memo` | Not needed (fine-grained updates) |
| `Suspense` | `<svelte:boundary>` with a `pending` snippet (async flag) |
| `lazy` / `next/dynamic` | `{#await import('./X.svelte') then { default: X }}<X />{/await}` (client-only in effect: SSR renders the pending branch) |
| `createPortal` | No built-in (below) |
| Error boundary | `<svelte:boundary>` with `failed(error, reset)` / `onerror` |
| `key` on list items | `{#each xs as x (x.id)}` |
| `key` to reset a component | `{#key id}<C/>{/key}` |
| Controlled input | `bind:value` or a function binding |
| `cn()` | `class={[base, cond && 'x', className]}` (clsx built in since 5.16). Keep `twMerge(clsx(...))` only for Tailwind conflict resolution; type the prop as `ClassValue` |
| `{c && <X/>}` / ternary | `{#if c}<X/>{:else}…{/if}` |
| `.map()` | `{#each}` |
| `children` / render props | `Snippet` / `Snippet<[T]>` with `{@render}` |

### Snippets for the non-trivial rows
```ts
// useReducer
let s = $state.raw<State>(init);
const dispatch = (a: Action) => { s = reducer(s, a); };
```
```svelte
<!-- useTransition: pending flag around an async server call -->
<script lang="ts">
  let pending = $state(false);
  async function save() { pending = true; try { await api.save(draft); } finally { pending = false; } }
</script>
<button onclick={save} disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
```
```svelte
<!-- useOptimistic: override a derived, roll back on error (deriveds are writable since 5.25) -->
<script lang="ts">
  let { ticket, onstar }: { ticket: Ticket; onstar: () => Promise<void> } = $props();
  let stars = $derived(ticket.stars);
  async function star() { stars += 1; try { await onstar(); } catch { stars -= 1; } }
</script>
<button onclick={star}>★ {stars}</button>
```
```svelte
<!-- useActionState: form state + pending, plain Svelte -->
<script lang="ts">
  let result = $state<{ error?: string }>({});
  let pending = $state(false);
  async function onsubmit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault(); pending = true;
    try { result = await submitTicket(new FormData(e.currentTarget)); } finally { pending = false; }
  }
</script>
<form {onsubmit}>…{#if result.error}<p>{result.error}</p>{/if}<button disabled={pending}>Send</button></form>
```
```svelte
<!-- forwardRef: Input.svelte -->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  let { ref = $bindable(null), value = $bindable(), ...rest }:
    HTMLInputAttributes & { ref?: HTMLInputElement | null } = $props();
</script>
<input bind:this={ref} bind:value {...rest} />
<!-- parent: let el = $state<HTMLInputElement | null>(null);  <Input bind:ref={el} />
     The parent must initialise to null, not undefined, because the bindable has a fallback. -->
```
```svelte
<!-- Portal.svelte: a community pattern, not an official API.
     UNVERIFIED at runtime; client-only, since effects don't run during SSR.
     If the project uses bits-ui / shadcn-svelte, use its Portal instead. -->
<script lang="ts">
  import { mount, unmount, getAllContexts, type Snippet } from 'svelte';
  import PortalBody from './PortalBody.svelte'; // contains: let { children } = $props(); {@render children()}
  let { children, target = 'body' }: { children: Snippet; target?: string } = $props();
  const context = getAllContexts(); // keeps parent context available inside the portal
  $effect(() => {
    const inst = mount(PortalBody, { target: document.querySelector(target)!, props: { children }, context });
    return () => { unmount(inst); };
  });
</script>
```

## Sources
- /tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/research-svelte5/pkg/package/ (svelte@5.57.3 tarball: `types/index.d.ts`, `elements.d.ts`, `src/reactivity/media-query.js`, `src/internal/client/dom/elements/bindings/input.js`, `src/internal/client/context.js`, `src/internal/client/dom/task.js`, `src/compiler/phases/2-analyze/visitors/VariableDeclarator.js`, `src/compiler/phases/3-transform/client/visitors/DeclarationTag.js`, `.../shared/component.js`)
- https://svelte.dev/docs/svelte/llms.txt (saved as /tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/research-svelte5/docs/svelte-llms.txt). Sections read: runes, markup, blocks, snippet, @attach, declaration tags, bind, use, transition, animate, class, style, await, svelte-boundary, special elements, context, lifecycle, imperative API, hydratable, best practices, TypeScript, v5 migration guide, compiler/runtime errors and warnings
- https://raw.githubusercontent.com/sveltejs/svelte/main/packages/svelte/CHANGELOG.md (5.35 to 5.57.3)
- https://svelte.dev/docs/kit/llms.txt (remote functions opt-in, "Migrating to SvelteKit v3": config moved to the Vite plugin, render errors routed to boundaries)
- npm registry metadata for `svelte` (latest is 5.57.3, published 2026-10-26)
- Web search on portals (third-party only, no official API): https://bits-ui.com/docs/utilities/portal/llms.txt, https://www.skeleton.dev/docs/svelte/framework-components/portal.md, https://github.com/db6edr/svelte-portal


---

<!-- section: research:ui -->

# UI layer: shadcn/ui (React, Radix) → bits-ui + shadcn-svelte (Svelte 5.57 / Kit 3.1)

Checked against the published tarballs: bits-ui 2.20.5, shadcn-svelte 1.8.0, svelte-sonner 1.2.3, mode-watcher 1.1.0, @lucide/svelte 1.17.0 and 1.68.0, tailwind-variants 4.0.1, @internationalized/date 3.12.4. Also checked against the shadcn-svelte `nova` registry JSON and the repo's 30 `ui/*.tsx` files plus `globals.css`. Anything I could not confirm is marked **UNVERIFIED**.

## 0. Decisions (pin these)

| Package | Version | Why |
|---|---|---|
| `bits-ui` | `2.20.5` | Peer deps: `svelte ^5.33`, `@internationalized/date ^3.8.1`. Its own dev dependency is svelte 5.57.2. |
| `@internationalized/date` | `^3.12.4` | Calendar values. |
| `shadcn-svelte` (CLI, dev only) | `1.8.0` | Its default style is `nova`, which is the same design as React `radix-nova`. |
| `svelte-sonner` | `1.2.3` | Developed against Kit `^3.1.1` and svelte `^5.57.3`. |
| `mode-watcher` | `1.1.0`, or the fallback in §6 | Stale: tested against Kit 2.20 and svelte 5.27. |
| `@lucide/svelte` | **`1.17.0` exact** | All 182 repo icons render the same paths as lucide-react 1.17.0. 1.68.0 changes 11 of them (§7). |
| `tailwind-variants` | `^3.3.1` | The registry declares `^3.3.0`. 4.0 (2026-10-29) is breaking: `/config` subpath only, no peers, `cn(0)` semantics changed. |
| `tailwind-merge` | `3.7.0` | Keep it. tv@3 only merges classes when this optional peer is installed. |
| `clsx` | `2.1.1` | Keep it. |
| `tw-animate-css` | `1.4.0` | Unchanged. |
| `vaul-svelte` | not needed | Only shadcn-svelte's Drawer uses it, via `vaul-svelte@next` (1.0.0-next.7, a 2025-03 prerelease). The repo has no drawer. Sheet is built on bits `Dialog`. |

## 1. CSS changes in `src/app.css` (do these first)

1. Replace `@import "shadcn/tailwind.css"`. The React file defines `@custom-variant data-selected { &:where([data-selected="true"]) }`. bits-ui sets `data-selected=""`, so Command and Calendar highlights would silently never apply. Use the shadcn-svelte variant set instead. It is the same block as the React file with `data-selected` commented out, so Tailwind v4's native `data-selected:` (attribute presence) is used. It ships as `shadcn-svelte/tailwind.css` (export condition `style`). Either `@import "shadcn-svelte/tailwind.css";` or copy these into `app.css`: `data-open`, `data-closed`, `data-checked`, `data-unchecked`, `data-disabled`, `data-active`, `data-horizontal`, `data-vertical`, `@utility no-scrollbar`, plus the accordion keyframes (renamed to `--bits-accordion-content-height`).
2. Keep all theme tokens (`@theme inline`, `:root`, `.dark`) and `@custom-variant dark (&:is(.dark *))` exactly as they are. The generated components use the same token names.
3. Rename CSS variables in class strings:

| Radix | bits-ui |
|---|---|
| `--radix-<c>-content-transform-origin` | `--bits-<c>-content-transform-origin` |
| `--radix-<c>-content-available-height` | `--bits-<c>-content-available-height` |
| `--radix-<c>-trigger-width` / `-height` | `--bits-<c>-anchor-width` / `-anchor-height` |

   `<c>` is one of `dropdown-menu`, `context-menu`, `popover`, `tooltip`, `select`, `link-preview` (HoverCard). Also: `--bits-collapsible-content-height` and `-width`, `--bits-command-list-height` (was `--cmdk-list-height`), and `--bits-scroll-area-thumb-*`.
4. The repo's `**:[[cmdk-group-heading]]:*` selectors match nothing under bits-ui. bits emits `data-command-group-heading` (and `data-command-item`, etc.). Put the classes on `Command.GroupHeading`, or use `**:data-[command-group-heading]:…`.

## 2. bits-ui 2.20.5: rules that apply to every component

- **Import:** `import { Dialog, Select, Command, … } from "bits-ui";` then use parts as `<Dialog.Root>`. Helpers: `import { mergeProps, useId, type WithoutChildrenOrChild } from "bits-ui"`.
- **`asChild` becomes the `child` snippet.** Spread `props` onto your element:
  ```svelte
  <Tooltip.Trigger>
    {#snippet child({ props })}<Button {...props} variant="ghost" size="icon-sm"><XIcon /></Button>{/snippet}
  </Tooltip.Trigger>
  ```
  On floating Content, `child` receives `{ props, wrapperProps, open }`. Render `<div {...wrapperProps}><div {...props}>…</div></div>`; the wrapper carries the transform and z-index. Without `child`, your `class` lands on the inner element.
- **State.** Use `bind:open`, `bind:value`, `bind:checked`, `bind:pressed`, or a prop plus `onOpenChange` / `onValueChange` / `onCheckedChange` / `onPressedChange`. Passing `open={x}` without binding only seeds internal state. For a truly controlled value use a function binding: `bind:open={() => open, (v) => (open = v)}`. Use `onOpenChangeComplete` for after-animation hooks. Use `bind:ref` instead of React refs.
- **Portals are never automatic.** Wrap Content in `X.Portal` (props `to`, `disabled`).
- **Floating defaults** (from `floating-layer-content.svelte`): `side="bottom"`, `sideOffset=0`, `align="center"`, `alignOffset=0`, `avoidCollisions=true`, `collisionPadding=0`, `sticky="partial"`, `hideWhenDetached=false`, `strategy="fixed"`. Also available: `collisionBoundary`, `arrowPadding`, `customAnchor` (replaces `Popover.Anchor`, which does not exist).
  - Content gets `data-side` and `data-align`, so `data-[side=bottom]:slide-in-from-top-2` keeps working.
  - DropdownMenu Content defaults to `loop=true` (Radix: false).
  - Popover Content defaults to `trapFocus=true`, `preventScroll=false`.
  - Dialog Content defaults to `trapFocus=true`, `preventScroll=true`. There is no `modal` prop.
- **Event props:**
  - `onEscapeKeyDown` → `onEscapeKeydown`.
  - `onPointerDownOutside` / `onInteractOutside` → `onInteractOutside(e: PointerEvent)`.
  - `onOpenAutoFocus` and `onCloseAutoFocus` are unchanged; call `e.preventDefault()` to cancel.
  - New: `escapeKeydownBehavior` / `interactOutsideBehavior`, each `"close" | "ignore" | "defer-otherwise-close" | "defer-otherwise-ignore"`.
- **Presence.** Unmounting waits for CSS animations, so `data-closed:animate-out` works. Content also emits `data-starting-style` / `data-ending-style` during transitions. `forceMount` plus `child({ open })` is for Svelte transitions.
- **Boolean data attributes are `""` (present) or absent, never `"true"`.** Rewrite `data-[disabled=true]:` → `data-disabled:` and `data-[selected=true]` → `data-selected:` / `[data-selected]`.

## 3. Component reference (parts · props · styling attributes · porting gotchas)

**AlertDialog**
- Parts: `Root Trigger Portal Overlay Content Title Description Action Cancel`.
- `Action` does **not** close the dialog (verified: `DialogActionState` has no click handler). Set `open = false` yourself. `Cancel` does close. Radix Action closed on click; AlertDialog is used in 28 repo files.
- Attributes: `data-state=open|closed`; Content `data-nested`, `data-nested-open`; CSS vars `--bits-dialog-depth`, `--bits-dialog-nested-count`.

**Dialog** (Sheet too: `Dialog` plus your own `data-side`)
- Parts: `Root Trigger Portal Overlay Content Title Description Close`.
- `Title` has a `level` prop (1–6). Attributes: same as AlertDialog.

**Avatar**
- Parts: `Root Image Fallback`. Root props `delayMs`, `bind:loadingStatus` (`loading|loaded|error`), `onLoadingStatusChange`.
- Attribute: `data-status`. Image is `display:none` until loaded.

**Checkbox**
- Parts: `Root Group GroupLabel`. No `Indicator`: use `{#snippet children({ checked, indeterminate })}`.
- `checked` is a boolean; `indeterminate` is a separate prop. Radix used `checked: boolean | "indeterminate"`.
- Attributes: `data-state=checked|unchecked|indeterminate`, `data-disabled`, `data-readonly`.

**Collapsible**
- Parts: `Root Trigger Content`. Root `bind:open`, `disabled`; Content `forceMount`, `hiddenUntilFound`.
- Attributes: `data-state=open|closed`, `data-disabled`.

**Command** (replaces cmdk)
- Parts: `Root Input List Viewport Empty Loading Group GroupHeading GroupItems Item LinkItem Separator`.
- Root props:
  - `bind:value`: the highlighted item.
  - `filter(value, search, keywords) => number`: same signature as cmdk; default `computeCommandScore`.
  - `shouldFilter=true`, `loop=false`, `vimBindings=true` (Ctrl+N/J/P/K), `disablePointerSelection`, `columns`, `label`, `onStateChange`.
- Input: `bind:value` is the search text. There is no `onValueChange` on Input.
- Item props: `value` (falls back to trimmed text content), `keywords`, `disabled`, `forceMount`.
  - **`onSelect: () => void` takes no argument.** cmdk passed the value; there are 12 repo call sites.
- Group: no `heading` prop. Give it `value` and use `GroupHeading` + `GroupItems`. The shadcn-svelte wrapper restores `heading`.
- Keys: arrows, Home/End, Enter.
- Attributes: Item `data-selected=""`, `aria-selected`, `data-disabled`, `data-value`, `data-group`, `data-command-item`.

**ContextMenu / DropdownMenu**
- Parts: `Root Trigger Portal Content Item Group GroupHeading CheckboxItem CheckboxGroup RadioGroup RadioItem Separator Arrow Sub SubTrigger SubContent`.
- `Label` → `GroupHeading`, which belongs inside `Group`. shadcn-svelte keeps a plain-div `Label`.
- Item props: `onSelect(e)` (`e.preventDefault()` keeps the menu open, same as Radix), `closeOnSelect=true`, `textValue`, `disabled`.
- CheckboxItem / RadioItem: no `ItemIndicator`. Use `{#snippet children({ checked, indeterminate })}`.
- **shadcn-svelte sets `closeOnSelect=false` on CheckboxItem; Radix closes.** Delete that default for parity.
- SubTrigger has `openDelay`. SubContent renders in place, with no portal.
- Items receive real DOM focus, so `focus:bg-accent` works. They also get `data-highlighted`.
- Attributes: Content and SubTrigger `data-state=open|closed`; items `data-disabled`, `data-highlighted`, `data-state=checked|unchecked|indeterminate`.

**HoverCard → `LinkPreview`**
- Parts: `Root Trigger Portal Content ContentStatic Arrow`.
- Root: `openDelay=700`, `closeDelay=300`, `bind:open`. CSS var prefix `--bits-link-preview-*`.

**Label**
- `Label.Root` renders `<label>`; use `for`, not `htmlFor`.

**Popover**
- Parts: `Root Trigger Portal Content ContentStatic Close Arrow Overlay`. No Anchor (use `customAnchor`).

**Progress**
- `Root` only (no Indicator); render your own `<div style="transform:translateX(-{100 - (100 * (value ?? 0)) / max}%)">`.
- Props `value` (`null` = indeterminate), `min`, `max`.
- Attributes: `data-state=loading|loaded|indeterminate`, `data-value`, `data-max`.

**RadioGroup**
- Parts: `Root Item`. Item has no Indicator: `{#snippet children({ checked })}`.
- Root: `bind:value`, `orientation`, `loop`, `name`, `required`, `autocomplete` (hidden input defaults to `"off"`).
- Attributes: `data-state=checked|unchecked`, `data-orientation`, `data-disabled`.

**ScrollArea**
- Parts: `Root Viewport Scrollbar Thumb Corner` (Radix `ScrollAreaScrollbar` → `Scrollbar`).
- Root `type` is `hover|scroll|auto|always`, plus `scrollHideDelay`. `Scrollbar orientation` is required.
- Attributes: Scrollbar/Thumb `data-state=visible|hidden`, `data-orientation`.

**Select**
- Parts: `Root Trigger Value Portal Content ContentStatic Viewport Item Group GroupHeading ScrollUpButton ScrollDownButton`. No Separator, ItemText or ItemIndicator.
- **`type="single"|"multiple"` is required.** `value` is `string` / `string[]`. Other Root props: `items={[{ value, label, disabled }]}`, `allowDeselect`, `loop`, `scrollAlignment`, `name` (renders a hidden input).
- `Select.Value` exists in 2.x. It resolves the label from `items` first, so **pass `items`**; otherwise the raw value shows until items mount.
- Item: `value`, `label` (used for typeahead), `{#snippet children({ selected, highlighted })}`.
- **Highlight is virtual (aria-activedescendant), so add `data-highlighted:bg-accent data-highlighted:text-accent-foreground`.**
- **There is no `position="item-aligned"`** (the repo's default). Content always pops below the trigger, so the open Select cannot match pixel-for-pixel.
- Attributes: Trigger `data-state`, `data-placeholder`, `data-disabled`; Item `data-highlighted`, `data-selected`, `data-disabled`.

**Separator**
- Attribute `data-orientation`. `decorative` defaults to `false` (the repo passed `true`).

**Switch**
- Parts: `Root Thumb`. `bind:checked`.
- Root and Thumb both get `data-state=checked|unchecked`, plus `data-disabled`.

**Tabs**
- Parts: `Root List Trigger Content`. Root: `bind:value`, `activationMode="automatic"`, `orientation`, `loop`.
- Attributes: `data-state=active|inactive`, `data-orientation`.

**Toggle**
- `Root` with `bind:pressed`. Attributes: `data-state=on|off`, `aria-pressed`.

**ToggleGroup**
- Parts: `Root Item`. Root needs `type` and `bind:value`; also `rovingFocus`, `loop`, `orientation`.
- Item attributes: `data-state=on|off`, `data-value`.

**Tooltip**
- Parts: `Provider Root Trigger Portal Content ContentStatic Arrow`.
- **`Tooltip.Provider` is required** (context throws without it). Provider defaults are `delayDuration=700` and `skipDelayDuration=300`; the repo needs `delayDuration={0}`.
- Content attribute `data-state` is `delayed-open|instant-open|closed` (same as Radix).

**Calendar / RangeCalendar**
- Parts: `Root Header Heading PrevButton NextButton MonthSelect YearSelect Grid GridHead GridBody GridRow HeadCell Cell Day`.
- Root: `type="single"|"multiple"` (RangeCalendar has none), `bind:value` (a `DateValue`), `bind:placeholder` (replaces `defaultMonth`), `minValue`, `maxValue`, `isDateDisabled`, `isDateUnavailable`, `weekStartsOn`, `numberOfMonths`, `fixedWeeks`, `locale`, `disableDaysOutsideMonth`.
- Day attributes: `data-selected`, `data-today`, `data-outside-month`, `data-unavailable`, `data-disabled`. Range adds `data-range-start`, `-end`, `-middle`, `data-highlighted`.
- The repo only uses `mode="single"` (3 call sites).

**Calendar example:**
```svelte
<script lang="ts">
  import { parseDate, type DateValue } from "@internationalized/date";
  import { Calendar } from "#lib/components/ui/calendar/index.js";
  let { iso, onSelect }: { iso?: string; onSelect: (d: string) => void } = $props();
  let value = $state<DateValue | undefined>(iso ? parseDate(iso) : undefined);
</script>
<Calendar type="single" bind:value placeholder={value} onValueChange={(v) => v && onSelect(v.toString())} />
```
`v.toString()` returns `YYYY-MM-DD`. For a JS `Date`: `v.toDate(getLocalTimeZone())`, or `fromDate(d, tz)` in the other direction.

**Select example:**
```svelte
<Select.Root type="single" bind:value {items}>
  <Select.Trigger><Select.Value placeholder="Status" /></Select.Trigger>
  <Select.Portal><Select.Content sideOffset={4}><Select.Viewport>
    {#each items as it (it.value)}
      <Select.Item value={it.value} label={it.label}>
        {#snippet children({ selected })}{it.label}{#if selected}<CheckIcon />{/if}{/snippet}
      </Select.Item>
    {/each}
  </Select.Viewport></Select.Content></Select.Portal>
</Select.Root>
```

**Command example:**
```svelte
<Command.Root loop bind:value>
  <Command.Input bind:value={search} placeholder="Search…" />
  <Command.List>
    <Command.Empty>No results.</Command.Empty>
    <Command.Group value="status">
      <Command.GroupHeading>Status</Command.GroupHeading>
      <Command.GroupItems>
        <Command.Item value="todo" keywords={["open"]} onSelect={() => setStatus("todo")}>Todo</Command.Item>
      </Command.GroupItems>
    </Command.Group>
  </Command.List>
</Command.Root>
```

## 4. shadcn-svelte 1.8.0

- **Support.** Tailwind v4 is the default since May 2025 (the v3 registry lives at tw3.shadcn-svelte.com). Svelte peer is `^5.0.0`. Registry items pin `bits-ui@^2.20.0`.
- **SvelteKit 3.** Kit 3 drops `svelte.config.js` and `$lib`, replacing it with `package.json` `"imports": { "#lib": "./src/lib/index.js", "#lib/*": "./src/lib/*" }`, and imports need file extensions.
  - The 1.8.0 CLI bundle detects `imports["#lib/*"]` (verified in `dist/index.mjs`). Registry imports already use `.js` / `.svelte` extensions.
  - The docs still show `$lib`, so whether Kit 3 is officially supported is **UNVERIFIED**.
- **Components in the `nova` registry:** all 30 the repo needs, including `sheet` (bits Dialog), `sonner` (svelte-sonner + mode-watcher), `calendar`, `range-calendar`, `input-group`, `toggle-group`, `command` (+ dialog + input-group), `hover-card` (LinkPreview). `drawer` is vaul-svelte@next.
- **`cn`.** The registry's `utils.ts` is now `export { cn } from "cn"` (shadcn's `cn@0.5.x` package, Sept 2026) plus `WithoutChild`, `WithoutChildren`, `WithoutChildrenOrChild`, `WithElementRef`. The old clsx + tailwind-merge helper still works (per the changelog).
- **Variants.** Components use `tv()` from tailwind-variants instead of cva: `buttonVariants = tv({ base, variants, defaultVariants })` and `type ButtonVariant = VariantProps<typeof buttonVariants>["variant"]`. They can be copied and re-styled freely; they are plain source files in your repo.

**Recommendation: generate with the CLI, then apply a short delta list. Do not hand-port the tsx files.**

I diffed class tokens between the repo's tsx and the `nova` Svelte sources. The class strings match apart from the bits-specific changes and the repo's own customisations listed below. The CLI also already does the bits-specific work: `data-highlighted` on Select items, `--bits-*` variables, `child` snippets, indicator snippets, and the `data-selected` handling. Hand-porting would mean re-deriving all of that for no gain in pixel parity.

Steps:
1. Write `components.json` by hand. **Do not run `init` against the real CSS; it overwrites the file.**
   ```json
   {"$schema":"https://shadcn-svelte.com/schema.json","style":"nova","tailwind":{"css":"src/app.css","baseColor":"neutral"},
    "aliases":{"lib":"#lib","utils":"#lib/utils","components":"#lib/components","ui":"#lib/components/ui","hooks":"#lib/hooks"},
    "typescript":true,"registry":"https://shadcn-svelte.com/registry","iconLibrary":"lucide","menuColor":"default","menuAccent":"subtle"}
   ```
   The keys `style`, `iconLibrary`, `menuColor` and `menuAccent` come from the CLI's default config and are not in the docs.
2. Run `pnpm dlx shadcn-svelte@1.8.0 add alert-dialog avatar button calendar card checkbox collapsible command context-menu dialog dropdown-menu hover-card input input-group label popover progress radio-group scroll-area select separator sheet sonner switch table tabs textarea toggle toggle-group tooltip --no-deps-install`.
   - The CLI turns `cn-font-heading` into `font-heading` (because `--font-heading:` exists) and strips `cn-menu-target` / `cn-menu-translucent` when `menuColor` is `default`. The icon placeholders become `import XIcon from '@lucide/svelte/icons/x'`.
   - Remove leftover `cn-rtl-flip` classes; they have no CSS.
3. Re-apply the repo's own changes:
   - Dialog, AlertDialog and their Overlays: `duration-100` → `duration-(--motion-base)`. Add `shadow-popover` to Dialog and AlertDialog Content.
   - Sheet: `shadow-lg duration-200 ease-in-out` → `shadow-popover`.
   - DropdownMenu and ContextMenu CheckboxItem and RadioItem: drop the `closeOnSelect = false` default.
   - Sonner: add `--border-radius: var(--radius)`.
   - Button: add `data-variant={variant} data-size={size}` (the Svelte version omits them).
   - Keep the generated tooltip arrow classes; they are tuned for bits' arrow positioning.
4. Expected unavoidable differences: Select opening position (no item-aligned) and the Calendar DOM (bits grid instead of react-day-picker; same `--cell-size` / `--cell-radius` tokens).

## 5. svelte-sonner 1.2.3

- `import { Toaster, toast, useSonner } from "svelte-sonner";` Styles are bundled; there is no CSS import.
- Toaster props: `theme` (`light|dark|system`, default **light**), `position`, `richColors`, `expand`, `duration`, `gap`, `visibleToasts`, `closeButton`, `offset`, `mobileOffset`, `hotkey`, `dir`, `swipeDirections`, `toastOptions`, `id`.
- Icons are snippet props: `successIcon`, `infoIcon`, `warningIcon`, `errorIcon`, `loadingIcon`, `closeIcon`.
- The `toast` API matches sonner: `toast(msg, opts)`, `.success`, `.error`, `.warning`, `.info`, `.loading`, `.promise`, `.custom(Component, { componentProps })`, `.dismiss(id)`, `.message`, `.getActiveToasts()`.
- The options the repo uses (`id`, `description`, `action: { label, onClick }`) are all supported.
- Gotchas:
  - `title` and `description` take `string | Component`, not JSX.
  - `className` → `class`; `classNames` → `classes`.
  - The React `icons={{…}}` object becomes snippets.
  - With multiple Toasters, `toasterId` filters toasts.

```svelte
<Toaster theme={userPrefersMode.current} position="bottom-right" class="toaster group"
  style="--normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border); --border-radius: var(--radius);"
  toastOptions={{ classes: { toast: "cn-toast" } }}>
  {#snippet successIcon()}<CircleCheckIcon class="size-4" />{/snippet}
  {#snippet loadingIcon()}<Loader2Icon class="size-4 animate-spin" />{/snippet}
</Toaster>
```

## 6. Theme: mode-watcher 1.1.0 (replaces next-themes)

- API: `import { ModeWatcher, mode, userPrefersMode, setMode, resetMode, toggleMode } from "mode-watcher";`
- These are **runes objects, not stores**:
  - `mode.current` is the resolved `light|dark`, and `undefined` on the server. It replaces `resolvedTheme`.
  - `userPrefersMode.current` is `light|dark|system` and replaces `theme`.
- `<ModeWatcher>` props: `defaultMode`, `track`, `darkClassNames=['dark']`, `lightClassNames`, `disableTransitions=true`, `modeStorageKey`, `themeStorageKey`, `nonce`, `themeColors`, `disableHeadScriptInjection`.
- No flash: it injects an inline `<svelte:head>{@html '<script>…'}` that sets `.dark` and `color-scheme` and writes `defaultMode` to localStorage before hydration.

Parity setup for the repo:
```svelte
<ModeWatcher defaultMode="dark" modeStorageKey="theme" disableTransitions={false} />
```
`modeStorageKey="theme"` keeps users' saved next-themes preference; the values are raw strings and compatible. Use `resetMode()` instead of `setMode("system")` (issue #144).

Risks:
- Last release 2025-06.
- Open issue #161: "render_fn is not a function" on Svelte 5.46.1, unresolved; the maintainer blames Svelte.
- Issue #156: `defaultMode` ignored.
- Issue #168: duplicate `runed` (0.25 vs bits-ui's 0.35).
- I compiled all of its `.svelte` files with svelte 5.57.3 for client and SSR: clean, warnings only. **Runtime behaviour on 5.57 / Kit 3 is UNVERIFIED.**

**Fallback if it misbehaves** (no dependency). Put an inline boot script next to the existing density script in `src/app.html`, before `%sveltekit.head%`. I did not check app.html changes in Kit 3, so that placement is **UNVERIFIED**.
```html
<script>try{var m=localStorage.getItem('theme')||'dark',d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){document.documentElement.classList.add('dark')}</script>
```
```ts
// src/lib/theme.svelte.ts
import { MediaQuery } from "svelte/reactivity";
export type Pref = "light" | "dark" | "system";
const sysDark = new MediaQuery("(prefers-color-scheme: dark)", true);
class Theme {
  pref = $state<Pref>("dark");
  resolved = $derived(this.pref === "system" ? (sysDark.current ? "dark" : "light") : this.pref);
  init() { try { this.pref = (localStorage.getItem("theme") as Pref) ?? "dark"; } catch {} }
  set(p: Pref) { this.pref = p; try { localStorage.setItem("theme", p); } catch {} }
}
export const theme = new Theme();
// in the root +layout.svelte: onMount(() => theme.init());
// $effect(() => { document.documentElement.classList.toggle("dark", theme.resolved === "dark"); document.documentElement.style.colorScheme = theme.resolved; });
```

## 7. @lucide/svelte

- Imports:
  - Per-icon (what the CLI emits): `import CheckIcon from "@lucide/svelte/icons/check";`
  - Named imports also work and tree-shake (`sideEffects:false`): `import { Check, CheckIcon, LucideCheck } from "@lucide/svelte";`
  - Types: `import type { LucideIcon, LucideProps } from "@lucide/svelte";`
- Props:
  - Same as React: `size` (24), `color` ("currentColor"), `strokeWidth` (2), `absoluteStrokeWidth`, `class`, and any SVG attribute.
  - New in Svelte: `nonScalingStroke`, `title`, `children`.
  - Global defaults: `setLucideProps({...})` from `@lucide/svelte/context`.
- The SVG gets `class="lucide lucide-<name> …"` and `aria-hidden="true"`, the same as React. Dynamic icons render as `<item.icon class="size-4" />`.
- **Version.** With `1.17.0` (same day as lucide-react 1.17.0), all 182 repo icons exist and render identical paths. With `1.68.0`, these change:
  - Different paths: `CalendarArrowUp`, `CalendarClock`, `CalendarDays`, `CalendarRange`, `CalendarX2`, `CircleCheck` (also `CircleCheckIcon` / `CheckCircle2`), `GitPullRequestClosed`, `Zap`.
  - Remapped: `SmilePlus` now points to `face-slightly-smiling-plus`.
  - Deprecated aliases that still export: `AlertCircle`, `AlertTriangle`, `ArchiveRestore`, `BarChart3`, `Building2`, `CheckCircle`, `CheckCircle2`, `CircleHelp`, `Code2`, `FilePlus2`, `GanttChart`, `History`, `Loader2`, `MoreHorizontal`, `SmilePlus`, `Trash2`, `XCircle`. In 1.68, `Trash` is the old `Trash2` glyph.
  - The CLI installs the latest version, so re-pin afterwards.

## 8. Class merging in Svelte

- Since Svelte 5.16 the `class` attribute accepts objects and arrays (handled by clsx): `class={["base", cond && "x", { y: on }]}`. `ClassValue` comes from `svelte/elements` (5.19+). The `class:` directive is now discouraged.
- **It does not resolve conflicts.** Any wrapper that accepts an override class must still use `cn()`:
  ```ts
  // src/lib/utils.ts
  import { clsx, type ClassValue } from "clsx";
  import { twMerge } from "tailwind-merge";
  export function cn(...i: ClassValue[]) { return twMerge(clsx(i)); }
  // re-export the WithoutChild / WithoutChildren / WithoutChildrenOrChild / WithElementRef types (copy from the registry utils)
  ```
  `class` is a reserved word, so destructure it: `let { class: className, ...rest } = $props()`.
- `cn@0.5.x` claims to be a drop-in replacement. It is pre-1.0, so I would not adopt it for this migration.

## 9. UNVERIFIED

- mode-watcher at runtime on svelte 5.57.3 / Kit 3.1.
- Official shadcn-svelte docs for Kit 3 and `#lib` (only the CLI code detects it).
- Kit 3 changes to `app.html` / `%sveltekit.head%`.
- That a `Tooltip.Provider` is required at runtime (I saw the context object in the source and the migration-guide wording, but did not execute it).
- Exact rendering differences in Calendar.

## Sources
- Packages (npm pack, read as data): bits-ui@2.20.5 (`dist/bits/*/types.d.ts`, `*.svelte.js`, `internal/attrs.js`, `floating-utils.svelte.js`, `floating-layer-content.svelte`), shadcn-svelte@1.8.0 (`dist/tailwind.css`, `dist/index.mjs`, transformers), svelte-sonner@1.2.3, mode-watcher@1.1.0, @lucide/svelte@1.68.0 and @lucide/svelte@1.17.0, tailwind-variants@4.0.1, cn@0.5.2, @internationalized/date@3.12.4; npm metadata for vaul-svelte and tailwind-variants@3.3.1.
- Registry: https://shadcn-svelte.com/registry/styles/nova/index.json and `/<component>.json` (35 items).
- Repo: `/home/oscar/Projects/ticket-system/src/components/ui/*.tsx`, `components.json`, `src/app/globals.css`, `node_modules/shadcn/dist/tailwind.css`, `node_modules/lucide-react@1.17.0`.
- Docs: https://shadcn-svelte.com/docs/installation/sveltekit · /docs/installation/manual · /docs/components-json · /docs/cli · /docs/changelog · /docs/changelog/2026-09-cn · https://bits-ui.com/docs/migration-guide · https://github.com/huntabyte/bits-ui/releases · https://svelte.dev/docs/svelte/class · https://svelte.dev/docs/kit/migrating-to-sveltekit-3 · https://svelte.dev/docs/kit/$lib · https://github.com/heroui-inc/tailwind-variants/releases · https://github.com/svecosystem/mode-watcher/issues (#161, #156) · https://lucide.dev/guide/packages/lucide-svelte
- Scripts and extracted files: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/research-ui/` (`scripts/cmp.py` for the class diff, `scripts/iconcmp.py` for the glyph diff, `extracted/` for the generated registry sources).


---

<!-- section: research:feature -->

# Feature libraries reference for the SvelteKit 3.1 / Svelte 5.57 port (checked 2026-11-04)

**Latest versions on npm today:** `@dnd-kit/svelte|dom|helpers|abstract` 0.5.3 · `svelte-tiptap` 3.0.2 · `@tiptap/*` 3.32.2 (repo has 3.31.3) · `@tiptap/y-tiptap` 3.0.12 · `better-auth` 1.6.33 pinned (1.6.34 is the latest 1.6.x; 1.7.17 is `latest`) · `graphql-yoga` 5.24.6 (v6.0.1 shipped 2026-10-22) · `svelte-exmarkdown` 5.0.2 · `svelte-dnd-action` 0.9.80 · `@sveltejs/kit` 3.1.1 · `svelte` 5.57.3 · `@sveltejs/adapter-vercel` 7.0.2.

**SvelteKit 3 changes that every snippet below assumes** (from the kit CHANGELOG and the 3.1.1 types):
- `Handle` and `sequence` come from `@sveltejs/kit/hooks`. They are no longer exported from `@sveltejs/kit`.
- `building` and `dev` come from `$app/env`. `$app/environment` still works but is a deprecated alias.
- `$lib` is replaced by `#lib`, and imports need explicit extensions (Better Auth's docs use `#lib/auth.js`).
- Cookie `path` now defaults to `'/'`.
- `redirect()` to an external URL now needs `{ external: true }` or an allowlist.
- TypeScript 6, Node 22.17 and Vite 8 are now the minimum versions.

---

## 1. Drag and drop: `@dnd-kit/svelte` 0.5.3

Install `@dnd-kit/svelte @dnd-kit/dom @dnd-kit/helpers @dnd-kit/abstract`, all at 0.5.3, and bump helpers from 0.4 to match. Peer dependency: `svelte ^5.29`.

| React 0.4 (repo) | Svelte 0.5.3 |
|---|---|
| `DragDropProvider`, `DragOverlay`, `KeyboardSensor`, `PointerSensor` from `@dnd-kit/react` | Same names from `@dnd-kit/svelte`. The sensors are re-exported from `@dnd-kit/dom`. |
| `useDroppable()` → `{ref, isDropTarget}` | `createDroppable()` → `{attach, isDropTarget, droppable}`, used as `{@attach d.attach}` |
| `useSortable()` from `@dnd-kit/react/sortable` | `createSortable()` from `@dnd-kit/svelte/sortable` → `{attach, attachHandle, attachSource, attachTarget, isDragging, isDropping, isDragSource, isDropTarget, sortable}` |
| `<DragOverlay>{(source)=>…}</DragOverlay>` | `<DragOverlay>{#snippet children(source)}…{/snippet}</DragOverlay>`. Props are `disabled` and `dropAnimation` (`null` turns the animation off). |
| `ComponentProps<typeof DragDropProvider>['onDragOver']` | Types `DragStartEvent`, `DragOverEvent` and `DragEndEvent` from `@dnd-kit/dom`. Handlers have the signature `(event, manager)`. |
| `move()` from `@dnd-kit/helpers` | Unchanged: `move(items: T[] \| Record<id, T[]>, event) => T`. If the target id is a record key, the item is inserted into that group. |

**Board.svelte** (renders the provider):
```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor } from '@dnd-kit/svelte';
  import { DragDropManager } from '@dnd-kit/dom';
  const sensors = [PointerSensor, KeyboardSensor.configure({
    offset: { x: COLUMN_WIDTH + COLUMN_GAP, y: 48 },
    keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'],
      up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] },
  })];
  // dnd-kit#2112 (open): the provider builds `new DragDropManager({})` and applies `sensors` later in an
  // $effect, so items that register first keep the DEFAULT KeyboardSensor. Build the manager yourself
  // AND still pass `sensors`: with sensors undefined, the provider's effect resets them to the defaults.
  const manager = new DragDropManager({ sensors });
  onDestroy(() => manager.destroy());      // the provider only destroys managers it created itself
  const groups = new SortableGroups(() => ({ containers, mutations, manual: orderBy === 'manual' }));
</script>

<DragDropProvider {manager} {sensors} onDragStart={groups.onDragStart}
  onDragOver={groups.onDragOver} onDragEnd={groups.onDragEnd}>
  {#each laneCells as cell (cell.id)}
    <BoardCell {cell} items={groups.itemsOf(cell.id)} {selectedId} {onSelect} />
  {/each}
  <DragOverlay dropAnimation={null}>
    {#snippet children(source)}
      {@const issue = groups.issueOf(String(source.id))}
      {#if issue}<div style:width="{COLUMN_WIDTH - 12}px"><BoardCardContent {issue} class="shadow-popover" /></div>{/if}
    {/snippet}
  </DragOverlay>
</DragDropProvider>
```

**BoardCell.svelte and BoardCard.svelte** (each must be its own component inside the provider):
```svelte
<script lang="ts">  // BoardCell
  import { createDroppable } from '@dnd-kit/svelte';
  let { cell, items, selectedId, onSelect } = $props();
  const droppable = createDroppable({
    get id() { return cell.id; }, type: 'column', accept: 'issue',
    collisionPriority: 1,   // CollisionPriority.Low (@dnd-kit/abstract). Read once at construction, not re-synced.
  });
</script>
<div {@attach droppable.attach} class={['flex min-h-24 …', droppable.isDropTarget && 'bg-accent ring-1 ring-ring/40']}>
  {#each items as { id, issue }, index (id)}<BoardCard {id} {index} container={cell.id} {issue} />{/each}
</div>

<script lang="ts">  // BoardCard
  import { createSortable } from '@dnd-kit/svelte/sortable';
  let { id, index, container, issue } = $props();
  const s = createSortable({
    get id() { return id; }, get index() { return index; }, get group() { return container; },
    type: 'issue', accept: 'issue',
    get disabled() { return !canWrite || isPendingIssue(issue); },
  });
</script>
<div {@attach s.attach} tabindex="0" class={[…, s.isDragSource && 'opacity-40']}>…</div>
```

**Port of `use-sortable-groups.ts`:** move it to `sortable-groups.svelte.ts` as a class. Use `order = $state.raw<Record<string,string[]>|null>(null)`, a plain `#live` field in place of `useRef`, `$derived` for `base` and `byId`, and arrow-function handlers. The logic, including `move(state.order, event)` and `event.preventDefault()`, carries over unchanged.

**Gotchas**
- **Reactive input must be passed as getters.** The bindings re-read `input.id`, `index`, `group` and `disabled` inside `$effect`. A plain object literal freezes the initial values.
- **No optimistic sorting in Svelte.** `createSortable` removes `OptimisticSortingPlugin` from its defaults, because DOM reordering breaks keyed `{#each}`. Visual sorting therefore depends on your `onDragOver` state updates, which the repo already does. Always key `{#each}` by sortable id.
- **Primitives need the provider's context.** Call `create*` in a child of `DragDropProvider`, never in the component that renders it, and never inline inside `{#each}`.
- **DragOverlay needs the `Feedback` plugin.** If you pass custom `plugins` without it, the overlay silently renders nothing. Primitives inside the overlay do not register, because it uses a patched registry. Only one overlay is allowed per provider.
- **Open Svelte bugs:**
  - #2136: the overlay disappears one frame early when you hide the source with `isDragSource`. The repo dims the source with `opacity-40` rather than hiding it.
  - #1947: dropping outside a target in multiple lists leaves bad DOM. Always reset `order = null` in `onDragEnd`, and test this case.
  - #1963: HMR breaks a drag that is in progress (dev only).

**Production readiness:** it is pre-1.0. The adapter first shipped in Feb 2026 and has had eight releases. The core is shared with `@dnd-kit/react` 0.x, which the repo already runs. It is usable with the workarounds above.

**Fallback if it is not good enough:** `svelte-dnd-action` 0.9.80. It is mature, accepts `svelte ^5`, and has built-in keyboard and ARIA support. Its model is different: an items array per zone, `use:dndzone={{ items, flipDurationMs, type: 'issue' }} onconsider={h} onfinalize={h}`. It has no DragOverlay, it inserts a shadow placeholder item, every item needs a unique `id`, and only the start key is configurable (`setKeyboardDragTrigger('space')`), not the per-key column offset.

---

## 2. Tiptap 3.32 in Svelte 5

**Pin every `@tiptap/*` package to one exact version (3.32.2).** Their peer dependencies are exact (for example, `@tiptap/markdown` requires `@tiptap/core: "3.32.2"`). Replace every `from '@tiptap/react'` import with `from '@tiptap/core'` (`Editor`, `Extension`, `Node`, `AnyExtension`, `JSONContent`). `extensions.ts`, `markdown-io.ts`, the markdown tokenizers and the collaboration helpers then port with nothing else changed.

**Recommendation:** drive `@tiptap/core` directly from an attachment. Use `svelte-tiptap` only for `SvelteNodeViewRenderer` and `NodeViewWrapper`. The repo uses no BubbleMenu or FloatingMenu, and its suggestion menu is rendered by the host from state.

Importing `svelte-tiptap` at all still requires its peer dependencies: `@tiptap/extension-bubble-menu`, `@tiptap/extension-floating-menu` and `@floating-ui/dom`. Its `createEditor(opts)` returns a `Readable<Editor>` store that re-emits on every transaction (`<EditorContent editor={$editor} />`), and it must be created in `onMount`.

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import { Editor } from '@tiptap/core';
  let { extensions, value, disabled, onChange } = $props();
  let editor = $state.raw<Editor | null>(null);
  let tx = $state(0);                                            // replaces useEditorState
  const active = $derived.by(() => { tx; return editor ? { bold: editor.isActive('bold') } : null; });
  $effect(() => { editor?.setEditable(!disabled); });
  function attach(el: HTMLElement) {
    return untrack(() => {          // attachments re-run when any state read inside them changes
      const e = new Editor({
        element: el, extensions, content: value, contentType: 'markdown', // contentType comes from @tiptap/markdown
        editorProps: { attributes: { class: EDITOR_CLASS, role: 'textbox', 'aria-multiline': 'true' } },
        onTransaction: () => { tx++; },
        onUpdate: ({ editor }) => onChange(tidyMarkdown(editor.getMarkdown())),
      });
      editor = e;
      return () => { e.destroy(); editor = null; };
    });
  }
</script>
<div {@attach attach}></div>
```
Attachments do not run during SSR, which replaces `immediatelyRender: false`. With Collaboration enabled, do not pass `content`; seed through the provider instead.

**Node view** (port of `EmbedNodeView`): `addNodeView() { return SvelteNodeViewRenderer(EmbedNodeView, { context }) }`. Here `context = getAllContexts()` is captured during component init and passed into `createExtensions`, because node views are mounted outside the component tree.
```svelte
<script lang="ts">
  import type { NodeViewProps } from '@tiptap/core';
  import { NodeViewWrapper } from 'svelte-tiptap';
  let { node, selected }: NodeViewProps = $props();
  const url = $derived(String(node.attrs.url ?? '')); const embed = $derived(embedFor(url));
</script>
<NodeViewWrapper contenteditable="false" data-drag-handle class="my-2">
  {#if embed}<EmbedFrame {embed} {url} {selected} />{:else}<p class="text-sm text-muted-foreground">{url}</p>{/if}
</NodeViewWrapper>
```
The root element must be `NodeViewWrapper`; anything else throws an invariant error. Props arrive as a `$state` object and update in place. `NodeViewContent` exists for editable content.

**Suggestions (mention, `#` issue references, slash commands)**

*Option A (closest to the repo, preferred):* keep `render()` calling `runtime.menu.show / hide / keyDown`. In Svelte, `runtime` becomes a plain object whose methods write `menu = $state<…|null>(null)` in RichEditor, which then renders `<SuggestionMenu>`. Closures read live props, so the `RuntimeRef` indirection goes away.

*Option B (`mount()`):* the plugin's `props.mount(el)` (present in 3.31.3+ and 3.32.2) appends `el` to the container (default `document.body`), positions it with Floating UI `autoUpdate`, enables `dismissOnOutsideClick`, and returns an unmount function.
```ts
// suggestion-render.svelte.ts  (the .svelte.ts extension is required for $state)
import { mount, unmount } from 'svelte';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import Menu from './SuggestionMenu.svelte';
export const svelteRender = <I>(context?: Map<any, any>): NonNullable<SuggestionOptions<I, I>['render']> => () => {
  const p = $state({ entries: [] as I[], active: 0, loading: false, pick: (_: I) => {} });
  let app: Record<string, any> | null = null, detach: (() => void) | null = null;
  const sync = (s: SuggestionProps<I, I>) => { p.entries = s.items; p.loading = s.loading; p.pick = s.command;
    if (p.active >= s.items.length) p.active = 0; };
  return {
    onStart(s) { sync(s); const el = document.createElement('div');
      app = mount(Menu, { target: el, props: p, context }); detach = s.mount(el); },
    onUpdate: sync,
    onKeyDown({ event }) {
      const n = p.entries.length;
      if (event.key === 'ArrowDown' && n) { p.active = (p.active + 1) % n; return true; }
      if (event.key === 'ArrowUp' && n) { p.active = (p.active - 1 + n) % n; return true; }
      if (event.key === 'Enter' && n) { p.pick(p.entries[p.active]); return true; }
      return false;
    },
    onExit() { detach?.(); if (app) void unmount(app); app = detach = null; },
  };
};
```
- Mutating the `$state` props object updates the mounted component; this replaces `$set`.
- `unmount()` returns `Promise<void>`.
- Effects inside the mounted component do not run synchronously during `mount`.
- `SuggestionProps` also exposes `clientRect`, `decorationNode`, `query` and `range`. Options include `debounce`, `minQueryLength`, `initialItems`, `placement` and `container`.

**Collaboration** (`@tiptap/extension-collaboration` and `@tiptap/extension-collaboration-caret` at 3.32.2, `@tiptap/y-tiptap` ^3.0.12, `yjs` 13.6):
- The configuration is unchanged: `Collaboration.configure({ document: provider.doc })` and `CollaborationCaret.configure({ provider, user: { id, name, color }, render })`. Keep `StarterKit.configure({ undoRedo: false })`.
- `isChangeOrigin` from `@tiptap/extension-collaboration` and `prosemirrorJSONToYXmlFragment` from `@tiptap/y-tiptap` work as before.
- Replace `useSyncExternalStore` (peers, snapshot) with a class that uses `createSubscriber` from `svelte/reactivity` (Svelte 5.7+): `this.#sub = createSubscriber(u => { aw.on('change', u); return () => aw.off('change', u); })`. Call `this.#sub()` inside the getter.
- The deprecated caret `onUpdate` is replaced by `editor.storage.collaborationCaret.users`.

**`@tiptap/markdown` 3.32.2** (bundles `marked` ^17): `Markdown.configure({ markedOptions: { gfm: true } })`, `editor.getMarkdown()`, `editor.markdown.parse/serialize`, `setContent(md, { contentType: 'markdown' })`, plus the custom `markdownTokenizer` / `parseMarkdown` / `renderMarkdown` on extensions. None of this depends on React; port it unchanged.

---

## 3. Better Auth 1.6.33 with SvelteKit 3

**Peer dependency caveat:** 1.6.33 and 1.6.34 declare `@sveltejs/kit: ^2.0.0`; 1.7.17 widens it to `^2 || ^3`. The runtime of `better-auth/svelte-kit` is byte-identical between 1.6.33 and 1.7.17 (I diffed `integrations/svelte-kit.mjs`). Keep 1.6.33 and silence the warning with pnpm `peerDependencyRules.allowedVersions: { "better-auth>@sveltejs/kit": "3" }`. Upgrading to 1.7 is a separate decision; I did not review the 1.7 changes.

**`better-auth/svelte-kit` exports:** `svelteKitHandler({auth, event, resolve, building})`, `toSvelteKitHandler(auth)`, `isAuthPath(url, options)` and `sveltekitCookies(getRequestEvent)`.

```ts
// src/lib/server/auth.ts  (server-only, because it imports $app/server)
import { getRequestEvent } from '$app/server';
import { sveltekitCookies } from 'better-auth/svelte-kit';
export const auth = betterAuth({ /* …unchanged… */ plugins: [
  twoFactor({ issuer: 'Ticket System' }), jwt(), oauthProvider({…}), sso({…}), scim({…}),
  sveltekitCookies(getRequestEvent),   // replaces nextCookies(); MUST be last (it warns otherwise)
]});
```
- `sveltekitCookies` copies `Set-Cookie` headers into `event.cookies` for server-side `auth.api.signInEmail({ body, headers })` calls from form actions.
- It calls `getRequestEvent()` after `await`s, which needs AsyncLocalStorage. Node runtimes only (this matches the repo's no-Edge rule).
- Scripts and vitest that import `auth.ts` must resolve `$app/server`: run them through the sveltekit Vite plugin or mock it.

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler, isAuthPath } from 'better-auth/svelte-kit';
import { auth } from '#lib/server/auth.js';
export const handle: Handle = async ({ event, resolve }) => {
  if (!building && !isAuthPath(event.url.toString(), auth.options)) {   // skip the DB lookup for /api/auth/*
    const s = await auth.api.getSession({ headers: event.request.headers });
    event.locals.user = s?.user ?? null; event.locals.session = s?.session ?? null;
  }
  return svelteKitHandler({ event, resolve, auth, building });  // answers /api/auth/* before routing
};
// src/app.d.ts
import type { auth } from '#lib/server/auth.js';
type S = typeof auth.$Infer.Session;
declare global { namespace App { interface Locals { user: S['user'] | null; session: S['session'] | null } } }
export {};
```
- Delete `api/auth/[...all]`; the hook handles it. The alternative is `src/routes/api/auth/[...all]/+server.ts` with `const h = toSvelteKitHandler(auth); export { h as GET, h as POST }`, but use only one of the two.
- Replace `getSession()` / `headers()` in loads and endpoints with `locals.user`.

**`/.well-known/oauth-authorization-server`:** `src/routes/.well-known/oauth-authorization-server/api/auth/+server.ts`. Kit 3's route scanner does not skip dot-directories (I checked the source but have not run it).
```ts
import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { auth } from '#lib/server/auth.js';
const meta = oauthProviderAuthServerMetadata(auth);       // (request: Request) => Promise<Response>
export const GET = ({ request }) => meta(request);
```

**Client** (the plugins carry over with the same imports):
```ts
import { createAuthClient } from 'better-auth/svelte';   // NOT better-auth/react or the root entry
import { twoFactorClient } from 'better-auth/client/plugins';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { scimClient } from '@better-auth/scim/client';
import { ssoClient } from '@better-auth/sso/client';
export const authClient = createAuthClient({ plugins: [twoFactorClient({ onTwoFactorRedirect() {
  window.location.href = `/login/two-factor${window.location.search}`; } }), ssoClient(), scimClient(), oauthProviderClient()] });
```
- Omit `baseURL`. It defaults to the `BETTER_AUTH_URL` / `PUBLIC_BETTER_AUTH_URL` environment variable, or to the relative `/api/auth`.
- `useSession()` returns a nanostores `Atom`: `const session = authClient.useSession()` and then `$session.data` / `$session.isPending`, or `fromStore(...)`.
- The atom never fetches on the server, so SSR always renders it as pending. Render auth-dependent UI from `locals.user` returned by the layout `load` instead.
- `authClient.$fetch('/oauth2/consent', …)`, `signIn.sso`, `signIn.social`, `twoFactor.*` and `linkSocial` are unchanged.
- An external server-side redirect needs `redirect(303, url, { external: true })`.

**Kit 3 CSRF caveat.** I checked this in the kit 3.1.1 source but have not tested it in a running app. Kit's check runs inside `internal_respond` before `handle`, so Better Auth cannot bypass it. In production it returns 403 for POST/PUT/PATCH/DELETE requests with a form content type (or no `Content-Type`) whose `Origin` is missing or cross-site. The repo breaks on:
- the SAML ACS endpoints `/api/auth/sso/saml2/callback/:id` and `/api/auth/sso/saml2/sp/acs/:id`
- `/api/auth/oauth2/token`, `/api/auth/oauth2/introspect` and `/api/auth/oauth2/revoke` (form-urlencoded, usually with no Origin)
- `/api/slack/commands` and `/api/slack/interactivity`

Listing specific origins in `trustedOrigins` cannot help, because a missing Origin is still rejected. The fix is `kit.csrf.trustedOrigins: ['*']`, which removes the check entirely (remote functions keep their own check), plus a replacement hook:
```ts
const EXEMPT = [/^\/api\/auth\/sso\/saml2\/(callback|sp\/acs)(\/|$)/, /^\/api\/auth\/oauth2\/(token|introspect|revoke)$/, /^\/api\/slack\//];
const FORM = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
const csrf: Handle = ({ event, resolve }) => {
  const { request: r, url } = event; const ct = r.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!dev && (!ct || FORM.includes(ct)) && ['POST','PUT','PATCH','DELETE'].includes(r.method)
      && r.headers.get('origin') !== url.origin && !EXEMPT.some((x) => x.test(url.pathname)))
    return new Response('Cross-site form submissions are forbidden', { status: 403 });
  return resolve(event);
};
export const handle = sequence(csrf, authHandle);   // sequence from '@sveltejs/kit/hooks'
```
Cookie names must be ASCII (kit 3 uses `cookie` v2). Better Auth's default names already are.

---

## 4. graphql-yoga 5 (keep 5.24.x; v6 needs Node ≥22.15 and is a separate migration)

```ts
// src/lib/server/graphql/schema.ts
export const yoga = createYoga<GraphQLServerContext, GraphQLContext>({
  graphqlEndpoint: '/api/graphql', graphiql: dev /* $app/env */, fetchAPI: { Response }, schema, context, plugins: [costLimits] });
// src/routes/api/graphql/+server.ts
import type { RequestHandler } from './$types';
const handle: RequestHandler = async ({ request }) => {
  if (request.method === 'OPTIONS' || wantsGraphiQL(request)) return yoga.handleRequest(request, { credential: null });
  /* size check + authenticateApiRequest exactly as today */
  return yoga.handleRequest(request, { credential: { userId, keyId, via, clientId, scopes } });
};
export { handle as GET, handle as POST, handle as OPTIONS };
```
- `handleRequest(request: Request, ctx: TServerContext)` comes from `@whatwg-node/server` 0.11.
- The official SvelteKit recipe (`export { yogaApp as GET, … }` plus `fetchAPI: { Response }`) also works, but the repo needs the auth wrapper.
- JSON POSTs are not affected by kit's CSRF check.

**SSE route** (`projects/[id]/stream`): use `+server.ts` with `GET = ({ params, request, locals })`, the same `ReadableStream` body and the same headers. Use `locals.user` in place of `getSession()`, and `export const config = { maxDuration: 60 }` (the adapter-vercel 7.0.2 type has `maxDuration`). In kit 3, `request.signal` aborts when the client disconnects.

---

## 5. Markdown: `svelte-exmarkdown` 5.0.2 (Svelte ^5.1.3)

This is the closest equivalent to react-markdown: a unified pipeline (remark-parse, remark-rehype, your plugins). The repo's four mdast plugins port unchanged, and tag overrides are done with snippets.

**XSS: the library does not sanitize by itself** (from reading its source):
- It runs `remark-rehype` with `allowDangerousHtml: true`. Raw HTML then renders as escaped text, where react-markdown's `skipHtml` dropped it.
- `href` and `src` pass through only `normalizeUri`, so `[x](javascript:…)` survives.

Add the plugin below as the last plugin.

```ts
// rehype-safe.ts: react-markdown's skipHtml + defaultUrlTransform, plus the `user:` mention protocol
const SAFE = /^(https?|ircs?|mailto|xmpp)$/i;
export function safeUrl(v: string) {
  if (v.startsWith('user:')) return v;
  const c = v.indexOf(':'), q = v.indexOf('?'), h = v.indexOf('#'), s = v.indexOf('/');
  return c === -1 || (s !== -1 && c > s) || (q !== -1 && c > q) || (h !== -1 && c > h) || SAFE.test(v.slice(0, c)) ? v : '';
}
export const rehypeSafe = () => (tree: any) => {
  const walk = (n: any) => { if (!n.children) return;
    n.children = n.children.filter((c: any) => c.type !== 'raw');
    for (const c of n.children) if (c.type === 'element') {
      for (const k of ['href', 'src']) if (typeof c.properties?.[k] === 'string') c.properties[k] = safeUrl(c.properties[k]);
      walk(c); } };
  walk(tree);
};
```
```svelte
<script lang="ts">
  import Markdown, { type Plugin } from 'svelte-exmarkdown';
  import { gfmPlugin } from 'svelte-exmarkdown/gfm';   // remark-gfm 4: tables, task lists, strikethrough, autolinks
  let { source, onToggleTask, embeds = true, class: cls } = $props();
  const plugins = $derived<Plugin[]>([gfmPlugin(), { remarkPlugin: remarkMentions }, { remarkPlugin: remarkTaskOffsets },
    ...(embeds ? [{ remarkPlugin: remarkEmbeds }] : []),
    ...(keyOk ? [{ remarkPlugin: [remarkIssueKeys, { ticketKey, projectId }] }] : []),
    { rehypePlugin: rehypeSafe }]);
</script>
<div class={[PROSE, cls]}><Markdown md={source} {plugins}>
  {#snippet a({ href, children })}
    {#if href?.startsWith('user:')}<MentionChip>{@render children?.()}</MentionChip>
    {:else if !href}<span>{@render children?.()}</span>
    {:else if isInternal(href)}<a {href}>{@render children?.()}</a>
    {:else}<a {href} target="_blank" rel="noreferrer noopener">{@render children?.()}</a>{/if}
  {/snippet}
  {#snippet input(p)}{#if p.type === 'checkbox'}<input type="checkbox" checked={!!p.checked} disabled={!onToggleTask}
    onchange={(e) => { const o = Number(e.currentTarget.closest<HTMLElement>('li[data-task-offset]')?.dataset.taskOffset);
      if (onToggleTask && Number.isInteger(o)) { const n = toggleTaskAt(source, o, e.currentTarget.checked); if (n !== null) onToggleTask(n); } }} />{/if}{/snippet}
  {#snippet div(p)}{@const e = embedFor(String(p['data-embed'] ?? ''))}
    {#if e}<EmbedFrame embed={e} url={p['data-embed']} />{:else}<div {...p}>{@render p.children?.()}</div>{/if}{/snippet}
  {#snippet img(p)}{#if p.src}<img src={p.src} alt={p.alt ?? ''} loading="lazy" />{/if}{/snippet}
</Markdown></div>
```
- Only `className` (converted to `class`) and `aria*` properties are converted. In `remarkTaskOffsets` and `remarkEmbeds`, write `hProperties: { 'data-task-offset': … }` and `{ 'data-embed': url }` in kebab case. Camel-case keys would be spread as lower-case junk attributes.
- Snippets receive the hast properties plus `children`. Component maps (`{ renderer: { h1: Comp | 'h2' | null } }`) can't close over per-instance props, which is why snippets are used here.
- `next/link` becomes a plain `<a>`; SvelteKit intercepts same-origin links.

---

## 6. Charts

The repo uses hand-rolled SVG (`chart-frame.tsx`, `bar-chart.tsx`, `line-chart.tsx`) with no chart library. Port it to Svelte components with no library:
- `useChartWidth` (ResizeObserver) becomes `<div bind:clientWidth={width}>`. Svelte measures it with ResizeObserver; it does not work on `display: inline` elements. Render nothing while `width === 0`.
- `useId` becomes `$props.id()` (5.20+, stable between SSR and hydration).
- `niceScale` and `tickIndexes` move unchanged into a `.ts` file. Scales and paths become `$derived`.
- `useActiveIndex` becomes a `.svelte.ts` class with `$state` and `onpointermove` / `onkeydown` handlers.
- Keep the visually hidden data table.

---

## UNVERIFIED
- `@dnd-kit/svelte` with the `manager` workaround, and the multiple-list drop-outside case (#1947), are not tested in this app.
- The `.well-known` dot-directory routing and the CSRF replacement hook were derived from kit 3.1.1 source, not run.
- The `#lib/... .js` extension convention is taken from Better Auth's docs; confirm it against the core-framework research.
- Better Auth 1.7.x changes beyond the identical SvelteKit integration were not reviewed.
- The exact location of the pnpm `peerDependencyRules` setting depends on the pnpm version (`package.json` `pnpm` field or `pnpm-workspace.yaml`).

## Sources
**Repo files** (`/home/oscar/Projects/ticket-system/src/`):
- `components/board/{board,board-card}.tsx`, `components/views/use-sortable-groups.ts`
- `components/editor/{extensions.ts,suggestion-menu.tsx,embed-node-view.tsx,markdown.tsx,rich-editor.tsx,markdown-editor.tsx}`
- `components/collab/{use-collab,use-collab-editor}.ts`, `components/charts/*`
- `lib/{auth,auth-client}.ts`, `app/api/{auth/[...all],graphql,projects/[id]/stream}/route.ts`, `app/.well-known/oauth-authorization-server/api/auth/route.ts`
- `node_modules/react-markdown/lib/index.js`

**Package tarballs** (in `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/research-feature-libs/pkg/`):
- `@dnd-kit/svelte|dom|helpers|abstract@0.5.3`, `svelte-dnd-action@0.9.80`
- `svelte-tiptap@3.0.2`, `@tiptap/{core,suggestion,markdown,extension-collaboration,extension-collaboration-caret}@3.32.2`, `@tiptap/y-tiptap@3.0.12`
- `better-auth@1.6.33`, `better-auth@1.7.17`, `@better-auth/oauth-provider@1.6.33`
- `@sveltejs/kit@3.1.1` (types and `src/runtime/server/{respond,csrf,endpoint}.js`, `create_manifest_data`), `@sveltejs/adapter-vercel@7.0.2`, `svelte@5.57.3`
- `graphql-yoga@5.24.6`, `@whatwg-node/server@0.11.0`, `svelte-exmarkdown@5.0.2`

**GitHub:**
- `sveltejs/kit` `packages/kit/CHANGELOG.md`; `clauderic/dnd-kit` `packages/svelte/CHANGELOG.md`
- dnd-kit issues #2112, #2136, #1947; `apps/stories-svelte/stories/Sortable/MultipleLists/*`; `apps/docs/docs/svelte/components/drag-drop-provider.mdx`
- `better-auth/better-auth` `docs/content/docs/integrations/svelte-kit.mdx`; `ssssota/svelte-exmarkdown` `docs/*` and `src/routes/docs/_example/*`

**Web:**
- https://dndkit.com/svelte, https://dndkit.com/svelte/primitives/create-sortable, https://dndkit.com/svelte/components/drag-overlay
- https://tiptap.dev/docs/editor/getting-started/install/svelte
- https://www.better-auth.com/docs/integrations/svelte-kit
- https://the-guild.dev/graphql/yoga-server/docs/integrations/integration-with-sveltekit
- https://svelte.dev/docs/svelte/@attach, https://svelte.dev/docs/svelte/imperative-component-api, https://svelte.dev/docs/svelte/v5-migration-guide, https://svelte.dev/docs/svelte/bind


---

# Verification of the riskiest claims (this wins)

# Verification of the port research (checked 2026-11-04)

I downloaded each tarball from the npm registry and extracted it into its own fresh directory under `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/verify/`. Nothing went into the repo, and I did not run any package scripts or package code. Other sources were the svelte.dev kit `llms.txt` and the GitHub issue API. I checked 19 claims: 14 are confirmed as written, 3 are confirmed with a costly gap or a wrong detail, 1 is partly confirmed, and 1 is a gap no section covers.

## Claims

1. **Kit: `svelte.config.js` and `.ts` are rejected, so all config goes in `sveltekit({...})`.** CONFIRMED.
   - In `src/exports/vite/index.js`, the plugin checks for both file names and throws `config_file_unsupported`. It also passes `configFile: false` to vite-plugin-svelte.

2. **Kit: remote functions are still experimental, and both `experimental.remoteFunctions` and `compilerOptions.experimental.async` are needed.** CONFIRMED.
   - `options.js` has `remoteFunctions: boolean(false)`, and `plugins/remote.js` raises an error when the flag is missing.
   - The docs say: "currently experimental… You must opt in by adding the `compilerOptions.experimental.async` and `experimental.remoteFunctions` options".

3. **Kit: `Handle`, `HandleServerError`, `HandleFetch`, `ServerInit`, `ClientInit`, `Reroute`, `Transport` and `sequence` come from `@sveltejs/kit/hooks`, not the root.** CONFIRMED.
   - They are in `types/index.d.ts` under `declare module '@sveltejs/kit/hooks'`. The root module no longer has `Handle` or `sequence`.
   - **Extra (costly):** `HandleServerError` now receives `CaughtError & { event }`, which has `kind`, `error` and `issues`. It no longer receives the Kit 2 `status` and `message` arguments. At runtime these log `handle_error_status_deprecated` and `handle_error_message_deprecated`.

4. **Kit: `init` is awaited before requests are served.** CONFIRMED for adapter-node.
   - `src/handler.js` runs a top-level `await server.init(...)`. `src/index.js` imports the handler before calling `listen`.
   - Kit's `runtime/server/instance.js` memoizes `init_promise` and awaits `module.init()`.
   - I did not check the `vite dev` and adapter-vercel per-request paths.

5. **Kit: `$lib` becomes `#lib` via package.json `imports`, imports need extensions, `alias: { '$lib': 'src/lib' }` is the escape hatch, and the top-level `alias` option is deprecated.** CONFIRMED.
   - Evidence: the `module_removed_lib` and `config_option_deprecated_alias` messages, and the docs section "`$lib` is now `#lib`".
   - The generated `tsconfig.json` goes to `node_modules/$app/tsconfig.json`. An alias like `@` generates both `@` and `@/*` paths.

6. **Kit: `$app/paths` exports only `asset`, `resolve` and `match`. Literal pathnames have no leading `/`; a leading `/` means a route ID.** CONFIRMED.
   - In the `ResolveArgs` type, anything starting with `/` must be a valid `RouteId`, or the type becomes `[never]`.
   - So `resolve('/tickets/123')` is a type error. Write `resolve('/tickets/[id]', { id })` or `resolve('tickets/123')`.

7. **Kit: only variables declared in `src/env.ts` (`export const variables = defineEnvVars(...)` from `@sveltejs/kit/env`) are exposed.** CONFIRMED.
   - In `core/env.js`, the generated env modules are empty when that file is missing.
   - `$env/static/private` re-exports `$app/env/private` and logs a deprecation warning.

8. **Kit: the CSRF check runs before `handle`, a missing `Origin` is rejected even when origins are listed, `trustedOrigins: ['*']` turns the check off, and remote calls are checked separately.** CONFIRMED.
   - Sources: `respond.js` lines 101–133, `__SVELTEKIT_CSRF_CHECK_ORIGIN__ = !trustedOrigins.includes('*')`, and `csrf.js` `(!request_origin || !trusted_origins.includes(...))`.
   - **WRONG detail in the feature section:** it writes `kit.csrf.trustedOrigins`. There is no `kit` namespace in 3.x.

9. **adapter-node 6: `ORIGIN` is removed, `paths.origin` is baked in at build time, the protocol defaults to https, and `BODY_SIZE_LIMIT` defaults to 512K.** CONFIRMED.
   - `index.js` writes `origin = JSON.stringify(builder.config.paths.origin)`, and `handler.js` falls back to `'https'`.
   - Production `dependencies` are externalized; everything else is bundled.

10. **Kit peer dependencies: vite ^8.0.12, svelte ^5.57.1, vite-plugin-svelte ^7, optional TypeScript ^6, node >=22.17.** CONFIRMED.
    - Caveat: npm's `typescript` `latest` tag is now **7.0.2**. svelte-check 4.7.8 only accepts TypeScript `^5 || ^6`.

11. **Svelte 5.57.3 APIs.** CONFIRMED.
    - `createContext` returns `[() => T, (context: T) => T, () => boolean]`.
    - `getAbortSignal`, `hydratable`, `settled`, `fork`, `$state.eager`, declaration tags and `compilerOptions.experimental.async` all exist.
    - `compilerOptions.runes` accepts a `({ filename }) => …` function.

12. **bits-ui 2.20.5 part names**, from `dist/bits/*/exports.d.ts`. CONFIRMED.
    - Select includes `Value`. Popover has `Overlay` and no `Anchor`. Calendar has `MonthSelect` and `YearSelect`. HoverCard is `LinkPreview`. Checkbox is `Root/Group/GroupLabel`. Menus use `GroupHeading`. Progress is `Root` only. ScrollArea uses `Scrollbar`.
    - Behaviour checks:
      - `DialogActionState` has no click handler, so AlertDialog Action does not close the dialog.
      - Command Item's `onSelect` is `() => void`.
      - Tooltip Root calls `TooltipProviderContext.get()`, so it needs a Provider; the Provider defaults are 700 and 300.
      - Floating Content defaults match the doc (bottom, 0, center, `partial`, `fixed`). DropdownMenu Content has `loop = true`.
      - The CSS variables follow the `--bits-${name}-anchor-width` pattern.
      - Select's `getLabelForValue` looks in `items` first.

13. **mode-watcher 1.1.0 works with Kit 3.** PARTLY CONFIRMED; runtime behaviour could not be checked.
    - It has no `$app/*` imports, and its only peer is `svelte ^5.27`, so Kit 3's removed modules don't affect it.
    - It depends on `runed ^0.25` and `svelte-toolbelt ^0.7.1`, while bits-ui uses `^0.35` and `^0.10`, so you get duplicate copies.
    - The mode is stored as a raw string (the serializer is `v => v`), so `modeStorageKey="theme"` can read next-themes' saved value.
    - The head script is a self-contained `setInitialMode.toString()`.
    - Issues #144, #156, #161 and #168 exist and are all open. The last publish was 2025-06-28.

14. **@dnd-kit/svelte 0.5.3 API.** CONFIRMED.
    - `DragDropProvider` takes `manager` plus the `DragDropManagerInput` options and `onDragStart`, `onDragOver`, `onDragEnd` and the other callbacks.
    - `DragOverlay` takes `disabled`, `dropAnimation` (`null` turns it off) and `children: Snippet<[Draggable]>`.
    - `createDroppable` returns `{ droppable, isDropTarget, attach }`. `createSortable` comes from `@dnd-kit/svelte/sortable` and returns `sortable`, `isDragging`, `isDropping`, `isDragSource`, `isDropTarget` and the four `attach*` functions.
    - The sensors are re-exported from `@dnd-kit/dom`, and the `Drag*Event` types live there.
    - The provider does `managerProp ?? new DragDropManager({})` and applies sensors in an `$effect`, which is issue #2112 (open). Issues #2136, #1947 and #1963 are also open.
    - `OptimisticSortingPlugin` is filtered out of the defaults. Droppable `collisionPriority` is not re-synced.

15. **svelte-tiptap 3.0.2 and Tiptap 3.32.2.** CONFIRMED.
    - It exports `createEditor`, which returns `Readable<Editor>`, plus `SvelteNodeViewRenderer(component, { context, … })`, `NodeViewWrapper`, `NodeViewContent`, `BubbleMenu` and `FloatingMenu`. A node view that doesn't use `NodeViewWrapper` fails an invariant check.
    - Its peers are `@floating-ui/dom`, `@tiptap/core`, `@tiptap/extension-bubble-menu`, `@tiptap/extension-floating-menu`, `@tiptap/pm` and `svelte`.
    - `@tiptap/markdown@3.32.2` pins `@tiptap/core: "3.32.2"` exactly. `contentType`, `getMarkdown` and the suggestion `mount` option all exist.

16. **Better Auth 1.6.33 with SvelteKit.** CONFIRMED.
    - `svelteKitHandler({ auth, event, resolve, building }): Promise<Response>` returns `resolve(event)` while building and `auth.handler(request)` for auth paths.
    - Also exported: `toSvelteKitHandler(auth)`, `isAuthPath(url: string, options)` and `sveltekitCookies(getRequestEvent)`, which warns if it isn't the last plugin.
    - The `@sveltejs/kit` peer is `^2.0.0` in 1.6.33 and `^2.0.0 || ^3.0.0` in 1.7.17. I diffed `svelte-kit.mjs` between them: identical.
    - `better-auth/svelte` `useSession()` returns a nanostores `Atom`, and the client `baseURL` falls back to `/api/auth`.
    - `oauthProviderAuthServerMetadata` is exported from `@better-auth/oauth-provider@1.6.33`.

17. **The `.well-known` route can live at `src/routes/.well-known/...`.** PARTLY WRONG.
    - The route scanner does not skip dot-directories.
    - But the Kit docs (Advanced routing) say: "Since TypeScript struggles with directories with a leading `.`… `src/routes/[x+2e]well-known/...`".
    - The snippet's `GET = ({ request }) =>` also has no type annotation, so `request` is an implicit `any` under `strict`.

18. **Gap no section covers: `process.env` during `vite dev`.**
    - Neither Kit 3 nor Vite 8 writes `.env` or `.env.local` into `process.env`. Vite's `loadEnv` works on a copy (`{...process.env}`), and Kit never assigns to `process.env`.
    - The repo reads `process.env` in 54 places. Better Auth's own env reader (`@better-auth/core/dist/env/env-impl.mjs`) also reads `process.env`.
    - Next.js loaded `.env.local` for you; under `vite dev` all of these are `undefined`.

19. **shadcn-svelte 1.8.0 and the nova registry.** CONFIRMED.
    - The package exports `./tailwind.css` under the `style` condition.
    - The CLI detects `imports["#lib/*"]`, and its default config is `style: nova`, `iconLibrary: lucide`, `menuColor: default`, `menuAccent: subtle`.
    - The registry pins: `utils` is `export { cn } from "cn"` with devDependency `cn@^0.5.0`, `button` needs `tailwind-variants@^3.3.0`, and `select` needs `bits-ui@^2.20.0`.

**Unverifiable statically:**
- How mode-watcher behaves at runtime on svelte 5.57.3 / Kit 3.1.
- The `vite dev` and adapter-vercel per-request `init` paths.
- Whether Vite 8 / Rolldown's string alias `'@'` leaves `@scope/pkg` alone. Kit emits `{ find: '@', replacement }`.
- Whether the shadcn-svelte CLI overwrites an existing `src/lib/utils.ts`. It has an opt-in `--overwrite` flag, but I didn't check the write path.

## Corrections builders must apply

1. **Load env into `process.env` in dev.**
   ```ts
   export default defineConfig(({ mode }) => {
     Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
     return { plugins: [sveltekit({ /* … */ })] };
   });
   ```
   `loadEnv` comes from `vite`. The alternative is moving every read to `$app/env/private` and declaring each variable in `src/env.ts`. Either way, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` must reach `process.env`, or be passed to `betterAuth({ secret, baseURL })` explicitly. In production, use `node --env-file=.env build`.
2. **Fix the CSRF setting.** Write `sveltekit({ csrf: { trustedOrigins: ['*'] } })`, not `kit.csrf…`. This replaces the kit section's `trustedOrigins: []`. The custom CSRF hook must `import { dev } from '$app/env'` and `import { sequence } from '@sveltejs/kit/hooks'`.
3. **Move the well-known route.** Use `src/routes/[x+2e]well-known/oauth-authorization-server/api/auth/+server.ts` with `export const GET: RequestHandler = ({ request }) => meta(request);`.
4. **Port `handleError` to the new input.** Don't read the `status` or `message` arguments. Use `error.status` and `error.message` for the `app` and `framework` kinds, and default to 500 / `'Internal Error'` for `unknown`.
5. **`resolve()` and `asset()` strings:**
   - Literal paths have no leading `/` (`resolve('tickets/123')`, `asset('logo.png')`).
   - Anything starting with `/` must be a route ID plus params.
   - `goto()` rejects external URLs, so use `window.location.href` for those.
6. **shadcn-svelte setup:**
   - If `app.css` uses `@import "shadcn-svelte/tailwind.css"`, add `shadcn-svelte@1.8.0` as a devDependency; `pnpm dlx` alone won't resolve from CSS. Otherwise copy the variants into `app.css`.
   - Write `src/lib/utils.ts` (clsx + tailwind-merge + the `With*` types) before running `add`, and answer no to overwrites.
   - Remove `cn` from package.json if the CLI adds it. `--no-deps-install` still writes the dependency to package.json; I didn't confirm the overwrite behaviour.
7. **Keep TypeScript on `^6.0.3`.** `typescript@latest` is 7.0.2, which breaks svelte-check 4.7.8 and Kit's `^6` peer.
8. **Use one `src/app.d.ts`.** Take the Better Auth–typed `Locals` from the feature section (`user` and `session` from `typeof auth.$Infer.Session`) instead of the kit section's `{ id: string }` example.
9. **mode-watcher: smoke-test before porting more UI.** Pin 1.1.0, expect duplicate `runed` copies (#168), and test it on first boot: dark default, toggling, `resetMode()` for system, and reading the stored `theme` key. Switch to the inline-script fallback if anything fails, given #161 and #156.