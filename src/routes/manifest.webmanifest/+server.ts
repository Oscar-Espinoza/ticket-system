// Web app manifest (was src/app/manifest.ts under Next; same content).
import manifest from '@/app/manifest';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () =>
  new Response(JSON.stringify(manifest()), { headers: { 'content-type': 'application/manifest+json' } });
