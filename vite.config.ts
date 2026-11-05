// SvelteKit 3 app config (SvelteKit 3 reads all of it from here: there is no
// svelte.config.js). During the migration the Next.js app still builds from
// next.config.ts; both share src/lib.
import { fileURLToPath } from 'node:url';
import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

const kitFile = (name: string) => fileURLToPath(new URL(`./src/lib/kit/${name}`, import.meta.url));
const pkgFile = (path: string) => fileURLToPath(new URL(`./node_modules/${path}`, import.meta.url));

function bareOrigin(url: string | undefined): `http://${string}` | `https://${string}` | undefined {
  if (!url) return undefined;
  try {
    const origin = new URL(url).origin;
    return /^https?:\/\//.test(origin) ? (origin as `https://${string}`) : undefined;
  } catch {
    return undefined;
  }
}

export default defineConfig(async ({ mode }) => {
  // Vite and SvelteKit don't put .env / .env.local into process.env, and the
  // shared server code reads process.env (as it did under Next). Real
  // environment variables win over the files.
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env });
  const inline = (name: string) => JSON.stringify(process.env[name] ?? '');

  return {
    plugins: [
      tailwindcss(),
      await sveltekit({
        adapter: process.env.VERCEL ? adapterVercel({ runtime: 'nodejs24.x' }) : adapterNode(),
        compilerOptions: {
          runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
          experimental: { async: true },
        },
        experimental: { remoteFunctions: true },
        // '@/…' → 'src/…' as in the Next app (deprecated option, still supported in 3.x).
        alias: { '@': 'src' },
        files: { assets: 'public' },
        // SvelteKit's own origin check would reject SAML/OAuth token posts and
        // Slack callbacks (no Origin header); src/hooks.server.ts does the check
        // with those exemptions. Remote functions keep Kit's own check.
        csrf: { trustedOrigins: ['*'] },
        // Build-time origin (adapter-node no longer reads ORIGIN): the URL people open.
        paths: { origin: bareOrigin(process.env.NEXT_PUBLIC_APP_URL) },
      }),
    ],
    resolve: {
      alias: [
        // Shared server code still imports these Next/React APIs; give it the
        // SvelteKit equivalents (src/lib/kit/next-shims.ts).
        { find: /^next\/(headers|cache|navigation|server)$/, replacement: kitFile('next-shims.ts') },
        { find: /^react$/, replacement: kitFile('react-shim.ts') },
        { find: /^better-auth\/next-js$/, replacement: kitFile('better-auth-cookies.ts') },
        // CSS-only packages exported under the "style" condition only: Tailwind's
        // Vite plugin resolves their @import without it in the SSR build.
        { find: /^tw-animate-css$/, replacement: pkgFile('tw-animate-css/dist/tw-animate.css') },
        { find: /^shadcn-svelte\/tailwind\.css$/, replacement: pkgFile('shadcn-svelte/dist/tailwind.css') },
      ],
    },
    // NEXT_PUBLIC_* were inlined at build time by Next; keep that for shared code.
    define: {
      'process.env.NEXT_PUBLIC_APP_URL': inline('NEXT_PUBLIC_APP_URL'),
      'process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY': inline('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    },
    // postcss.config.mjs is the Next app's (@tailwindcss/postcss); Tailwind runs
    // through @tailwindcss/vite here, so don't let Vite load that file too.
    css: { postcss: { plugins: [] } },
    server: { port: 5173 },
  };
});
