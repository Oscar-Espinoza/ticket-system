// Builds the MCP Apps view bundle (src/mcp-ui) into one self-contained HTML
// file that the /mcp server inlines with a `?raw` import
// (src/lib/server/mcp/ui.ts). Run by `npm run build:mcp-ui`
// (predev / prebuild). docs/mcp/PLAN.md D7.
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('./src/mcp-ui'),
  base: './',
  plugins: [
    tailwindcss(),
    svelte({
      configFile: false,
      compilerOptions: { runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true) },
    }),
    viteSingleFile(),
  ],
  resolve: { alias: { '@': here('./src') } },
  build: {
    outDir: here('./src/lib/server/mcp/ui'),
    emptyOutDir: false,
    target: 'es2022',
    cssCodeSplit: false,
    // No <link rel=modulepreload> in a one-file page, and the polyfill would add a fetch() call.
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: false,
    rolldownOptions: { input: here('./src/mcp-ui/app.html') },
  },
});
