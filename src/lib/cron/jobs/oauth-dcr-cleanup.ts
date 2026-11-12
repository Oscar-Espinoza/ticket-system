// Dynamically registered OAuth clients (MCP connectors, docs/mcp/PLAN.md D3)
// pile up: every Claude or ChatGPT connection registers its own, and anyone
// can register one without signing in. Two rules, dynamic clients only:
//   - never used: registered more than a day ago with no consent and no token
//     at all (an abandoned or junk registration);
//   - gone stale: registered more than 30 days ago, no unexpired access or
//     refresh token, and no token issued in the last 30 days.
// Consents and tokens cascade. Clients created in Settings → OAuth apps are
// never touched (only `metadata.registration = 'dynamic'` rows qualify).

import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { oauthAccessTokens, oauthClients, oauthConsents, oauthRefreshTokens } from '@/db/schema';
import { DYNAMIC_REGISTRATION } from '@/lib/server/mcp/register';
import { DAY_MS } from '@/lib/time';

export const STALE_AFTER_MS = 30 * DAY_MS;
export const UNUSED_AFTER_MS = DAY_MS;

export async function run(now: Date): Promise<string> {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  const unusedCutoff = new Date(now.getTime() - UNUSED_AFTER_MS);
  const ofClient = (table: { clientId: AnyPgColumn }) => eq(table.clientId, oauthClients.clientId);

  const liveAccess = db
    .select({ one: sql`1` })
    .from(oauthAccessTokens)
    .where(and(ofClient(oauthAccessTokens), or(gt(oauthAccessTokens.expiresAt, now), gt(oauthAccessTokens.createdAt, cutoff))));
  const liveRefresh = db
    .select({ one: sql`1` })
    .from(oauthRefreshTokens)
    .where(
      and(
        ofClient(oauthRefreshTokens),
        or(
          and(isNull(oauthRefreshTokens.revoked), gt(oauthRefreshTokens.expiresAt, now)),
          gt(oauthRefreshTokens.createdAt, cutoff),
        ),
      ),
    );
  const anyAccess = db.select({ one: sql`1` }).from(oauthAccessTokens).where(ofClient(oauthAccessTokens));
  const anyRefresh = db.select({ one: sql`1` }).from(oauthRefreshTokens).where(ofClient(oauthRefreshTokens));
  const anyConsent = db.select({ one: sql`1` }).from(oauthConsents).where(ofClient(oauthConsents));

  const removed = await db
    .delete(oauthClients)
    .where(
      and(
        sql`${oauthClients.metadata}->>'registration' = ${DYNAMIC_REGISTRATION}`,
        or(
          and(
            lt(oauthClients.createdAt, unusedCutoff),
            sql`not exists (${anyConsent})`,
            sql`not exists (${anyAccess})`,
            sql`not exists (${anyRefresh})`,
          ),
          and(lt(oauthClients.createdAt, cutoff), sql`not exists (${liveAccess})`, sql`not exists (${liveRefresh})`),
        ),
      ),
    )
    .returning({ id: oauthClients.id });
  return `removed ${removed.length} unused or stale dynamically registered OAuth clients`;
}
