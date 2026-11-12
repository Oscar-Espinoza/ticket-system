// Dynamically registered OAuth clients (MCP connectors, docs/mcp/PLAN.md D3)
// pile up: every Claude or ChatGPT connection registers its own. Delete those
// with no live token for 30 days: registered more than 30 days ago, no
// unexpired access or refresh token, and no token issued in the last 30 days.
// Consents and tokens cascade. Clients created in Settings → OAuth apps are
// never touched (only `metadata.registration = 'dynamic'` rows qualify).

import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { oauthAccessTokens, oauthClients, oauthRefreshTokens } from '@/db/schema';
import { DYNAMIC_REGISTRATION } from '@/lib/server/mcp/register';
import { DAY_MS } from '@/lib/time';

export const STALE_AFTER_MS = 30 * DAY_MS;

export async function run(now: Date): Promise<string> {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  const liveAccess = db
    .select({ one: sql`1` })
    .from(oauthAccessTokens)
    .where(
      and(
        eq(oauthAccessTokens.clientId, oauthClients.clientId),
        or(gt(oauthAccessTokens.expiresAt, now), gt(oauthAccessTokens.createdAt, cutoff)),
      ),
    );
  const liveRefresh = db
    .select({ one: sql`1` })
    .from(oauthRefreshTokens)
    .where(
      and(
        eq(oauthRefreshTokens.clientId, oauthClients.clientId),
        or(
          and(isNull(oauthRefreshTokens.revoked), gt(oauthRefreshTokens.expiresAt, now)),
          gt(oauthRefreshTokens.createdAt, cutoff),
        ),
      ),
    );
  const removed = await db
    .delete(oauthClients)
    .where(
      and(
        sql`${oauthClients.metadata}->>'registration' = ${DYNAMIC_REGISTRATION}`,
        lt(oauthClients.createdAt, cutoff),
        sql`not exists (${liveAccess})`,
        sql`not exists (${liveRefresh})`,
      ),
    )
    .returning({ id: oauthClients.id });
  return `removed ${removed.length} stale dynamically registered OAuth clients`;
}
