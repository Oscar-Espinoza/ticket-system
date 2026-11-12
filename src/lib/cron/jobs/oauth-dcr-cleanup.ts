// Dynamically registered OAuth clients (MCP connectors, docs/mcp/PLAN.md D3)
// pile up: every Claude or ChatGPT connection registers its own, and anyone
// can register one without signing in. Two rules, dynamic clients only:
//   - never used: registered more than a day ago with no consent and no token
//     at all (an abandoned or junk registration);
//   - gone stale: registered more than 30 days ago, no unexpired access or
//     refresh token, and no token issued in the last 30 days.
// Consents and tokens cascade (each token and consent table has an index on
// client_id for it). Clients created in Settings → OAuth apps are never
// touched (only `metadata.registration = 'dynamic'` rows qualify). Deletes run
// in batches with a cap per run, like the other jobs; the next run continues.

import { and, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { oauthAccessTokens, oauthClients, oauthConsents, oauthRefreshTokens } from '@/db/schema';
import { DYNAMIC_REGISTRATION } from '@/lib/server/mcp/register';
import { DAY_MS } from '@/lib/time';

export const STALE_AFTER_MS = 30 * DAY_MS;
export const UNUSED_AFTER_MS = DAY_MS;
export const BATCH = 200;
/** Safety valve: at most this many batches per run (the next run continues). */
const MAX_BATCHES = 10;

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

  const expired = and(
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
  );

  // One statement per batch: the rules are checked in the same statement that
  // deletes, so a client that gets a token meanwhile is kept.
  let removed = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const batch = db.select({ id: oauthClients.id }).from(oauthClients).where(expired).limit(BATCH);
    const rows = await db
      .delete(oauthClients)
      .where(inArray(oauthClients.id, batch))
      .returning({ id: oauthClients.id });
    removed += rows.length;
    if (rows.length < BATCH) break;
  }
  return `removed ${removed} unused or stale dynamically registered OAuth clients`;
}
