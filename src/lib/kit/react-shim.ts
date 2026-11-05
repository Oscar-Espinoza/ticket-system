// Stand-in for 'react' in the SvelteKit build (vite.config.ts alias). Shared
// server modules only use React's request-scoped `cache`.
export { cache } from './next-shims';

export function useSyncExternalStore(): never {
  throw new Error('React hooks are not available in the SvelteKit app; use the Svelte store for this module.');
}
