// POST   /api/push/subscriptions  { endpoint, keys: { p256dh, auth } } — save this device
// DELETE /api/push/subscriptions  { id } | { endpoint }              — forget one device
// Session auth; a caller only ever touches their own rows.

import { and, eq } from 'drizzle-orm';

import type { RequestHandler } from './$types';

import { db } from '@/lib/db';
import { pushSubscriptions } from '@/db/schema';

const MAX_ENDPOINT = 1024;
const MAX_KEY = 256;
const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

function fail(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_ENDPOINT) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function validKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_KEY && BASE64URL.test(value);
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return fail('Not authenticated', 401);

  const input = await body(request);
  const keys = input?.keys as Record<string, unknown> | undefined;
  if (!input || !validEndpoint(input.endpoint) || !keys || !validKey(keys.p256dh) || !validKey(keys.auth)) {
    return fail('Invalid subscription', 400);
  }

  const userAgent = request.headers.get('user-agent')?.slice(0, 512) ?? null;
  // Endpoints are unique per browser profile: re-subscribing (or another account
  // signing in on the same browser) takes the row over.
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      endpoint: input.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    })
    .returning({ id: pushSubscriptions.id });

  // Next revalidated /dashboard/settings/notifications here; the caller refreshes page data.
  return Response.json({ ok: true, id: row.id });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return fail('Not authenticated', 401);

  const input = await body(request);
  const id = typeof input?.id === 'string' && input.id.length <= 64 ? input.id : null;
  const endpoint = validEndpoint(input?.endpoint) ? input.endpoint : null;
  if (!id && !endpoint) return fail('Invalid request', 400);

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, user.id),
        id ? eq(pushSubscriptions.id, id) : eq(pushSubscriptions.endpoint, endpoint!),
      ),
    );

  return Response.json({ ok: true });
};
