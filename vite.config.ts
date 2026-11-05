// SvelteKit 3 app + Vitest config (SvelteKit 3 reads its options from here;
// there is no svelte.config.js).
import { fileURLToPath } from 'node:url';
import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

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
  // server code reads process.env. Real environment variables win over files.
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env });
  // Public values inlined at build time. NEXT_PUBLIC_* are the names from the
  // Next.js era, still accepted so existing .env files and deployments work.
  const appUrl = process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const vapidKey = process.env.PUBLIC_VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

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
        // '@/…' → 'src/…' (deprecated option, still supported in 3.x).
        alias: { '@': 'src' },
        files: { assets: 'public' },
        // SvelteKit's own origin check would reject SAML/OAuth token posts and
        // Slack callbacks (no Origin header); src/hooks.server.ts does the check
        // with those exemptions. Remote functions keep Kit's own check.
        csrf: { trustedOrigins: ['*'] },
        // Build-time origin (adapter-node no longer reads ORIGIN): the URL people open.
        paths: { origin: bareOrigin(appUrl) },
      }),
    ],
    resolve: {
      alias: [
        // CSS-only packages exported under the "style" condition only: Tailwind's
        // Vite plugin resolves their @import without it in the SSR build.
        { find: /^tw-animate-css$/, replacement: pkgFile('tw-animate-css/dist/tw-animate.css') },
        { find: /^shadcn-svelte\/tailwind\.css$/, replacement: pkgFile('shadcn-svelte/dist/tailwind.css') },
      ],
    },
    define: {
      'process.env.PUBLIC_APP_URL': JSON.stringify(appUrl ?? ''),
      'process.env.PUBLIC_VAPID_PUBLIC_KEY': JSON.stringify(vapidKey ?? ''),
    },
    // Same port as the Next.js app had, so .env.local and OAuth callback URLs keep working.
    server: { port: 3000 },
    preview: { port: 3000 },
    test: {
      environment: 'node',
      globals: true,
      setupFiles: ['src/tests/setup.ts'],
    },
    build: {
      rolldownOptions: {
        output: {
          // The default split gave the board page ~180 tiny preloaded chunks
          // (one per icon / bits-ui part), which delayed first paint. Group the
          // shared UI libraries; feature code still splits per route.
          codeSplitting: {
            groups: [
              { name: 'icons', test: /node_modules[\\/]@lucide[\\/]/ },
              {
                name: 'ui',
                test: /node_modules[\\/](bits-ui|svelte-toolbelt|runed|@floating-ui|tabbable|focus-trap|@internationalized|svelte-sonner|mode-watcher|clsx|tailwind-merge|class-variance-authority|style-to-object|inline-style-parser)[\\/]/,
              },
              { name: 'svelte', test: /node_modules[\\/](svelte|esm-env|devalue)[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
