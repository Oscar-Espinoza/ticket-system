// Stand-in for 'better-auth/next-js' in the SvelteKit build (vite.config.ts
// alias): src/lib/auth.ts keeps calling nextCookies() as its last plugin, and
// under SvelteKit that is Better Auth's sveltekitCookies, which writes
// Set-Cookie from server-side auth.api calls into event.cookies.
import { getRequestEvent } from '$app/server';
import { sveltekitCookies } from 'better-auth/svelte-kit';

export function nextCookies() {
  return sveltekitCookies(getRequestEvent);
}
