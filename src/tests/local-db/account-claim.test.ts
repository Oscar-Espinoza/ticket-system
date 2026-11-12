// Password reset and account claims (email configured): a reset proves the
// mailbox and sets the password, so it verifies the address and signs out
// every session; on an UNVERIFIED account it is the real owner claiming it,
// and everything the previous holder could have planted goes
// (claimUnverifiedAccount in src/lib/sso.ts, shared with SSO linking) — but
// only after the person saw the list and confirmed (the server refuses an
// unacknowledged reset), and they get the list again on the success page, in
// a "Your account was secured" email, in the audit log and as a one-time
// dashboard notice. Reset links are single-use, expire, only the newest
// works, and "Enforce SSO" domains can't use them. Real Better Auth against
// the local database.
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.RESEND_API_KEY = 're_test_not_a_real_key';
  process.env.EMAIL_FROM = 'Tickets <tickets@verify.test>';
  process.env.GOOGLE_CLIENT_ID = 'google-test.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'google-test-secret';
  delete process.env.REQUIRE_EMAIL_VERIFICATION;
});

import { db } from '@/lib/db';
import {
  accounts,
  activities,
  apiKeys,
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  projects,
  pushSubscriptions,
  slackUserLinks,
  ssoProviders,
  twoFactors,
  users,
  verifications,
  workspaceInvitations,
  workspaceMembers,
  workspaceSso,
  workspaces,
} from '@/db/schema';
import { auth } from '@/lib/auth';
import { generateApiKey } from '@/lib/api-auth';
import { queryAuditRows } from '@/lib/audit';
import { authenticateMcpRequest } from '@/lib/server/mcp/auth';
import { afterSettled } from '@/lib/kit/request';
import { takeClaimNotice } from '@/lib/server/account-claim';
import { onIdentityCreated } from '@/lib/sso';
import { localDb } from './guard';
import {
  accountsOf,
  cookieOf,
  emailsTo,
  googleSignIn,
  holdResend,
  openVerifyLink,
  requestReset,
  resetPassword,
  resetPreview,
  resetTokenFor,
  sessionOf,
  sessionUserId,
  signIn,
  signUp,
  stubOutboundHttp,
  uniqueEmail,
  userByEmail,
  verifyLinkFor,
} from './auth-email-flow';

const ATTACKER_PASSWORD = 'attacker-password-1';
const OWNER_PASSWORD = 'owner-new-password-1';
const now = () => new Date();
const uid = () => crypto.randomUUID();
const resetMails = (email: string) => emailsTo(email).filter((m) => m.subject === 'Reset your password');
const securedMails = (email: string) => emailsTo(email).filter((m) => m.subject === 'Your account was secured');

/** What plant() leaves, as a claim reports it (the reset keeps the password). */
const PLANTED_REPORT = {
  password: 0,
  twoFactor: 1,
  apiKeys: 1,
  connectedApps: 1,
  linkedSignIns: 1,
  oauthApps: 1,
  slack: 1,
  push: 1,
  invitations: 1,
};

const claimAudit = (userId: string) =>
  db
    .select({ data: activities.data })
    .from(activities)
    .where(and(eq(activities.type, 'security.account_claimed'), sql`${activities.data}->>'userId' = ${userId}`));

async function expireCooldown(userId: string) {
  await db
    .update(verifications)
    .set({ expiresAt: sql`now() - interval '1 second'` })
    .where(eq(verifications.identifier, `password-reset-sent:${userId}`));
}

/** `/mcp` accepts this bearer token (personal API key or opaque OAuth token). */
const mcpAccepts = async (token: string) =>
  (await authenticateMcpRequest(new Request('http://localhost/mcp', { headers: { authorization: `Bearer ${token}` } }))).ok;

/**
 * Everything a squatter could leave behind to keep a way in or keep reading the account.
 * Returns the two bearer tokens planted (a real API key and opaque OAuth access token).
 */
async function plant(userId: string, workspaceId: string) {
  const clientId = `client-${uid()}`;
  // A third-party app (registered by nobody here) the squatter granted access:
  // only deleting the grant shuts it out, the claim can't disable the app.
  const grantedClientId = `connector-${uid()}`;
  const apiKey = generateApiKey();
  const accessToken = `opaque-${uid()}`;
  await db.insert(workspaceInvitations).values({
    id: uid(),
    workspaceId,
    email: `accomplice-${uid()}@else.test`,
    token: uid(),
    invitedById: userId,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: now(),
  });
  await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, userId));
  await db.insert(twoFactors).values({ id: uid(), secret: 'planted', backupCodes: 'planted', userId });
  await db.insert(apiKeys).values({ id: uid(), userId, name: 'planted', prefix: apiKey.prefix, keyHash: apiKey.hash, createdAt: now() });
  await db.insert(accounts).values({
    id: uid(),
    accountId: `gh-${uid()}`,
    providerId: 'github',
    userId,
    createdAt: now(),
    updatedAt: now(),
  });
  await db.insert(oauthClients).values({ id: uid(), clientId, redirectUris: ['https://evil.example/cb'], userId, disabled: false });
  await db.insert(oauthClients).values({ id: uid(), clientId: grantedClientId, redirectUris: ['https://connector.example/cb'] });
  await db.insert(oauthConsents).values({ id: uid(), clientId: grantedClientId, userId, scopes: ['read'] });
  await db.insert(oauthRefreshTokens).values({ id: uid(), token: uid(), clientId: grantedClientId, userId, scopes: ['read'] });
  await db.insert(oauthAccessTokens).values({
    id: uid(),
    token: createHash('sha256').update(accessToken).digest('base64url'),
    clientId: grantedClientId,
    userId,
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: now(),
    scopes: ['read'],
  });
  await db.insert(slackUserLinks).values({ userId, teamId: `T${uid()}`, slackUserId: `U${uid()}`, createdAt: now() });
  await db.insert(pushSubscriptions).values({
    id: uid(),
    userId,
    endpoint: `https://push.example/${uid()}`,
    p256dh: 'k',
    auth: 'a',
    createdAt: now(),
  });
  return [apiKey.key, accessToken];
}

async function planted(userId: string) {
  const count = async (table: typeof twoFactors | typeof apiKeys | typeof oauthConsents | typeof oauthRefreshTokens | typeof slackUserLinks | typeof pushSubscriptions) =>
    (await db.select().from(table).where(eq(table.userId, userId))).length;
  return {
    twoFactor: await count(twoFactors),
    apiKeys: await count(apiKeys),
    // Disabled, not deleted: other people's connections to the app are kept, unusable.
    enabledOauthClients: (
      await db
        .select()
        .from(oauthClients)
        .where(and(eq(oauthClients.userId, userId), eq(oauthClients.disabled, false)))
    ).length,
    pendingInvitations: (
      await db.select().from(workspaceInvitations).where(eq(workspaceInvitations.invitedById, userId))
    ).length,
    oauthConsents: await count(oauthConsents),
    oauthRefreshTokens: await count(oauthRefreshTokens),
    slack: await count(slackUserLinks),
    push: await count(pushSubscriptions),
  };
}

const NOTHING_PLANTED = {
  twoFactor: 0,
  apiKeys: 0,
  enabledOauthClients: 0,
  pendingInvitations: 0,
  oauthConsents: 0,
  oauthRefreshTokens: 0,
  slack: 0,
  push: 0,
};
const ALL_PLANTED = { ...NOTHING_PLANTED, twoFactor: 1, apiKeys: 1, enabledOauthClients: 1, pendingInvitations: 1, oauthConsents: 1, oauthRefreshTokens: 1, slack: 1, push: 1 };

/** A workspace with SSO configured for `domain` (domain proof is optional outside production). */
async function workspaceWithSso(domain: string, enforced: boolean) {
  const ownerId = uid();
  await db.insert(users).values({
    id: ownerId,
    name: 'owner',
    email: `owner-${ownerId}@owner.test`,
    emailVerified: true,
    createdAt: now(),
    updatedAt: now(),
  });
  const workspaceId = uid();
  const providerId = `sso-${workspaceId}`;
  await db.insert(workspaces).values({ id: workspaceId, name: 'Corp', slug: `corp-${workspaceId}`, ownerId, createdAt: now(), updatedAt: now() });
  await db.insert(ssoProviders).values({ id: uid(), issuer: 'https://idp.example', providerId, domain });
  await db.insert(workspaceSso).values({ workspaceId, ssoProviderId: providerId, enforced, createdAt: now(), updatedAt: now() });
  // The workspace's audit log hangs on its oldest team.
  await db.insert(projects).values({
    id: uid(),
    name: 'Team',
    ticketKey: `T${uid().slice(0, 8).toUpperCase()}`,
    ownerId,
    workspaceId,
    createdAt: now(),
    updatedAt: now(),
  });
  return { workspaceId, providerId };
}

describe.skipIf(!localDb)('password reset and account claims', () => {
  beforeAll(() => stubOutboundHttp());
  afterAll(() => {
    vi.unstubAllGlobals();
    for (const key of ['RESEND_API_KEY', 'EMAIL_FROM', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) delete process.env[key];
  });

  it('lets the real owner claim a squatted address by resetting the password, once they confirm what goes', async () => {
    const victim = uniqueEmail('squatted');
    const attacker = await signUp(victim, '/dashboard', ATTACKER_PASSWORD, 'Totally the owner');
    const attackerCookie = cookieOf(attacker);
    const { id: squatId } = await userByEmail(victim);
    const { workspaceId } = await workspaceWithSso(`kept-${uid()}.test`, false);
    await db.insert(workspaceMembers).values({ id: uid(), workspaceId, userId: squatId, role: 'member', createdAt: now() });
    const bearers = await plant(squatId, workspaceId);
    for (const token of bearers) expect(await mcpAccepts(token)).toBe(true);

    expect((await requestReset(victim)).status).toBe(200);
    const [mail] = resetMails(victim);
    expect(mail.text).toContain(`/reset-password#token=`);
    expect(mail.text).toContain('never verified');
    expect(mail.text).not.toContain('evil.example');
    expect(mail.text).not.toContain('Totally the owner');
    const token = resetTokenFor(victim);

    // The page asks first: what would this link remove?
    expect(await resetPreview(token)).toEqual({ claim: true, removes: PLANTED_REPORT });

    // Without the confirmation the server refuses, and nothing changes.
    const unconfirmed = await resetPassword(token, OWNER_PASSWORD);
    expect(unconfirmed.status).toBe(400);
    expect(((await unconfirmed.json()) as { code: string }).code).toBe('ACCOUNT_CLAIM_NOT_ACKNOWLEDGED');
    expect(await planted(squatId)).toEqual(ALL_PLANTED);
    expect(await userByEmail(victim)).toMatchObject({ emailVerified: false, twoFactorEnabled: true });
    expect(await sessionOf(attackerCookie)).toBe(squatId);
    expect(securedMails(victim)).toHaveLength(0);

    // Confirmed: the same link (still unused) secures the account and says what went.
    const reset = await resetPassword(token, OWNER_PASSWORD, true);
    expect(reset.status).toBe(200);
    expect(await reset.json()).toEqual({ status: true, claimed: PLANTED_REPORT });
    expect(await sessionUserId(reset)).toBeNull();

    // The squatter is out: old password refused, session gone, nothing planted survives.
    expect((await signIn(victim, ATTACKER_PASSWORD)).status).toBe(401);
    expect(await sessionOf(attackerCookie)).toBeNull();
    expect(await planted(squatId)).toEqual(NOTHING_PLANTED);
    // …and neither planted bearer token gets into /mcp any more (JWTs: the consent re-check, consents gone above).
    for (const token of bearers) expect(await mcpAccepts(token)).toBe(false);
    expect((await accountsOf(squatId)).map((a) => a.providerId)).toEqual(['credential']);
    expect(await userByEmail(victim)).toMatchObject({ id: squatId, emailVerified: true, twoFactorEnabled: false });
    // Kept, as documented: memberships, and the app row (disabled).
    expect(await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, squatId))).toHaveLength(1);
    expect(await db.select().from(oauthClients).where(eq(oauthClients.userId, squatId))).toHaveLength(1);

    // Told three more ways: the email, the audit log, the first dashboard page.
    const [secured] = securedMails(victim);
    expect(secured.text).toContain('its password was reset with a link sent to this address');
    for (const line of ['Two-factor authentication', 'API keys', 'Connected apps and AI assistants', 'Linked Google and GitHub sign-ins', 'OAuth apps registered', 'The Slack link', 'Push notifications', 'Pending invitations', 'webhooks and integrations', 'If this wasn’t you']) {
      expect(secured.text).toContain(line);
    }
    expect(secured.text).not.toContain('The password (sign in with single sign-on');
    expect(secured.text).not.toContain('Totally the owner');
    const [audit] = await claimAudit(squatId);
    expect(audit.data).toMatchObject({ via: 'password_reset', removed: PLANTED_REPORT, workspaceId });
    // The audit log's per-viewer redaction (moved-events.ts) leaves a row without an issue as written, even with dropElsewhere.
    const shown = await queryAuditRows(
      and(eq(activities.type, 'security.account_claimed'), sql`${activities.data}->>'userId' = ${squatId}`),
      { limit: 5, viewerId: squatId, dropElsewhere: true },
    );
    expect(shown.map((row) => row.type)).toEqual(['security.account_claimed']);
    expect(await takeClaimNotice(squatId)).toMatchObject({ via: 'password_reset', removed: PLANTED_REPORT });
    expect(await takeClaimNotice(squatId)).toBeNull();

    // The owner signs in with the new password (no planted second factor), and Google now links.
    const owner = await signIn(victim, OWNER_PASSWORD);
    expect(owner.status).toBe(200);
    expect(await sessionUserId(owner)).toBe(squatId);
    const google = await googleSignIn({ sub: `g-${squatId}`, email: victim, email_verified: true, name: 'Victim' });
    expect(google.headers.get('location')).toBe('/dashboard');
    expect(await sessionUserId(google)).toBe(squatId);
  });

  it('tells nothing to a caller without a working reset link', async () => {
    const email = uniqueEmail('probe');
    await signUp(email);
    for (const token of [undefined, '', 'not-a-token', ['array'], 'x'.repeat(5000)]) {
      expect(await resetPreview(token)).toEqual({ claim: false });
    }
    await requestReset(email);
    const token = resetTokenFor(email);
    await db
      .update(verifications)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(verifications.identifier, `reset-password:${token}`));
    expect(await resetPreview(token)).toEqual({ claim: false });
  });

  it('fails closed when securing the account fails: sessions revoked, still unverified, a new link finishes it', async () => {
    const victim = uniqueEmail('claimfails');
    const attackerCookie = cookieOf(await signUp(victim, '/dashboard', ATTACKER_PASSWORD));
    const { id: squatId } = await userByEmail(victim);
    const { workspaceId } = await workspaceWithSso(`fails-${uid()}.test`, false);
    await plant(squatId, workspaceId);
    // Injected failure: deleting this account's API keys raises inside the claim's transaction.
    await db.execute(sql`
      create or replace function test_claim_fails() returns trigger language plpgsql as $$
      begin
        if old.user_id = ${sql.raw(`'${squatId}'`)} then raise exception 'injected claim failure'; end if;
        return old;
      end $$`);
    await db.execute(sql.raw(`create trigger test_claim_fails_${squatId.replaceAll('-', '')} before delete on api_key for each row execute function test_claim_fails()`));
    try {
      await requestReset(victim);
      const failed = await resetPassword(resetTokenFor(victim), OWNER_PASSWORD, true);
      expect(failed.status).toBe(500);
      expect(((await failed.json()) as { code: string }).code).toBe('ACCOUNT_CLAIM_FAILED');
      expect(await sessionOf(attackerCookie)).toBeNull();
      expect((await userByEmail(victim)).emailVerified).toBe(false);
      expect(securedMails(victim)).toHaveLength(0);
    } finally {
      await db.execute(sql.raw(`drop trigger test_claim_fails_${squatId.replaceAll('-', '')} on api_key`));
      await db.execute(sql`drop function if exists test_claim_fails()`);
    }
    // The next link claims for real.
    await expireCooldown(squatId);
    await requestReset(victim);
    expect((await resetPassword(resetTokenFor(victim), 'owner-newer-password-2', true)).status).toBe(200);
    expect(await planted(squatId)).toEqual(NOTHING_PLANTED);
    expect((await userByEmail(victim)).emailVerified).toBe(true);
  });

  it('answers a known address before its email is sent, like an unknown one', async () => {
    const known = uniqueEmail('timing');
    await signUp(known);
    const release = holdResend();
    try {
      // Straight to the handler: authRequest would wait for the email.
      const res = await auth.handler(
        new Request(`${new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').origin}/api/auth/request-password-reset`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').origin },
          body: JSON.stringify({ email: known }),
        }),
      );
      expect(res.status).toBe(200);
      expect(resetMails(known)).toHaveLength(0);
    } finally {
      release();
    }
    await afterSettled();
    expect(resetMails(known)).toHaveLength(1);
  });

  it('answers the same for an unknown address and sends nothing', async () => {
    const known = uniqueEmail('known');
    await signUp(known);
    const unknown = uniqueEmail('unknown');

    const a = await requestReset(known);
    const b = await requestReset(unknown);
    expect(b.status).toBe(a.status);
    expect(await b.json()).toEqual(await a.json());
    expect(resetMails(known)).toHaveLength(1);
    expect(emailsTo(unknown)).toHaveLength(0);
  });

  it('honours only the newest, unexpired link, once', async () => {
    const email = uniqueEmail('tokens');
    await signUp(email);
    const { id } = await userByEmail(email);

    await requestReset(email);
    const first = resetTokenFor(email);
    // Inside the cooldown: no second email.
    await requestReset(email);
    expect(resetMails(email)).toHaveLength(1);

    await expireCooldown(id);
    await requestReset(email);
    const second = resetTokenFor(email);
    expect(second).not.toBe(first);
    expect((await resetPassword(first, OWNER_PASSWORD, true)).status).toBe(400);

    expect((await resetPassword(second, OWNER_PASSWORD, true)).status).toBe(200);
    expect((await resetPassword(second, 'another-password-2', true)).status).toBe(400);

    await expireCooldown(id);
    await requestReset(email);
    const third = resetTokenFor(email);
    await db
      .update(verifications)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(verifications.identifier, `reset-password:${third}`));
    expect((await resetPassword(third, 'another-password-2')).status).toBe(400);

    expect((await signIn(email, OWNER_PASSWORD)).status).toBe(200);
  });

  it('refuses resets for a domain that enforces SSO, even with a link sent before', async () => {
    const domain = `enforced-${uid()}.test`;
    const email = `person-${uid()}@${domain}`;
    await signUp(email);
    await requestReset(email);
    const token = resetTokenFor(email);
    const { workspaceId } = await workspaceWithSso(domain, true);

    const request = await requestReset(email);
    expect(request.status).toBe(403);
    expect(((await request.json()) as { code: string }).code).toBe('SSO_REQUIRED');
    expect(resetMails(email)).toHaveLength(1);

    const reset = await resetPassword(token, OWNER_PASSWORD);
    expect(reset.status).toBe(403);
    expect((await userByEmail(email)).emailVerified).toBe(false);
    await db.update(workspaceSso).set({ enforced: false }).where(eq(workspaceSso.workspaceId, workspaceId));
    expect((await signIn(email, OWNER_PASSWORD)).status).toBe(401);
  });

  it('keeps two-factor on an ordinary reset of a verified account and signs every session out', async () => {
    const email = uniqueEmail('ordinary');
    const first = cookieOf(await signUp(email));
    await openVerifyLink(verifyLinkFor(email), first);
    const { id } = await userByEmail(email);
    await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, id));
    await db.insert(twoFactors).values({ id: uid(), secret: 'enrolled', backupCodes: 'codes', userId: id });
    const apiKeyId = uid();
    await db.insert(apiKeys).values({ id: apiKeyId, userId: id, name: 'mine', prefix: 'tk_mi', keyHash: uid(), createdAt: now() });

    await requestReset(email);
    const token = resetTokenFor(email);
    expect(await resetPreview(token)).toEqual({ claim: false });
    // No confirmation needed, and nothing to list.
    const reset = await resetPassword(token, OWNER_PASSWORD);
    expect(reset.status).toBe(200);
    expect(await reset.json()).toEqual({ status: true });
    expect(securedMails(email)).toHaveLength(0);

    expect(await sessionOf(first)).toBeNull();
    expect(await db.select().from(twoFactors).where(eq(twoFactors.userId, id))).toHaveLength(1);
    expect(await db.select().from(apiKeys).where(eq(apiKeys.id, apiKeyId))).toHaveLength(1);
    expect(await userByEmail(email)).toMatchObject({ emailVerified: true, twoFactorEnabled: true });

    const next = await signIn(email, OWNER_PASSWORD);
    expect(next.status).toBe(200);
    expect(await next.json()).toMatchObject({ twoFactorRedirect: true });
    expect(await sessionUserId(next)).toBeNull();
  });

  it('still drops a squatter’s password when SSO links, because the owner can’t verify the squat account', async () => {
    const domain = `ssoclaim-${uid()}.test`;
    const victim = `victim-${uid()}@${domain}`;
    const attackerCookie = cookieOf(await signUp(victim, '/dashboard', ATTACKER_PASSWORD));
    const { id: squatId } = await userByEmail(victim);
    const { workspaceId, providerId } = await workspaceWithSso(domain, false);
    await plant(squatId, workspaceId);

    // The owner (or a mail scanner) opens the verification email signed out: nothing changes.
    await openVerifyLink(verifyLinkFor(victim));
    expect((await userByEmail(victim)).emailVerified).toBe(false);

    // Later the workspace IdP (DNS-proven domain) links the owner's SSO identity to the account.
    await db.update(users).set({ createdAt: sql`now() - interval '5 minutes'` }).where(eq(users.id, squatId));
    await db.insert(accounts).values({ id: uid(), accountId: `idp-${uid()}`, providerId, userId: squatId, createdAt: now(), updatedAt: now() });
    await onIdentityCreated({ providerId, userId: squatId });
    await afterSettled();

    expect((await accountsOf(squatId)).map((a) => a.providerId)).toEqual([providerId]);
    expect((await signIn(victim, ATTACKER_PASSWORD)).status).toBe(401);
    expect(await sessionOf(attackerCookie)).toBeNull();
    expect(await planted(squatId)).toEqual(NOTHING_PLANTED);
    expect(await userByEmail(victim)).toMatchObject({ emailVerified: true, twoFactorEnabled: false });
    expect(
      await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, squatId))),
    ).toHaveLength(1);

    // Told: email, audit log, and the notice on the first dashboard page.
    const ssoReport = { ...PLANTED_REPORT, password: 1 };
    const [secured] = securedMails(victim);
    expect(secured.text).toContain('through your workspace’s single sign-on');
    expect(secured.text).toContain('The password (sign in with single sign-on from now on)');
    expect(secured.text).toContain('tell your workspace admin');
    expect((await claimAudit(squatId))[0].data).toMatchObject({ via: 'sso', removed: ssoReport });
    expect(await takeClaimNotice(squatId)).toMatchObject({ via: 'sso', removed: ssoReport });
  });
});
