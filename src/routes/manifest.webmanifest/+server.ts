import manifest from '@/lib/manifest';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () =>
  new Response(JSON.stringify(manifest()), { headers: { 'content-type': 'application/manifest+json' } });
