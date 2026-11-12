// Password reset and account claims (email configured): a reset proves the
// mailbox and sets the password, so it verifies the address and signs out
// every session; on an UNVERIFIED account it is the real owner claiming it,
// and everything the previous holder could have planted goes
// (claimUnverifiedAccount in src/lib/sso.ts, shared with SSO linking). Reset
// links are single-use, expire, only the newest works, and "Enforce SSO"
// domains can't use them. Real Better Auth against the local database.
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
  apiKeys,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  pushSubscriptions,
  slackUserLinks,
  ssoProviders,
  twoFactors,
  users,
  verifications,
  workspaceMembers,
  workspaceSso,
  workspaces,
} from '@/db/schema';
import { onIdentityCreated } from '@/lib/sso';
import { localDb } from './guard';
import {
  accountsOf,
  cookieOf,
  emailsTo,
  googleSignIn,
  openVerifyLink,
  requestReset,
  resetPassword,
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

async function expireCooldown(userId: string) {
  await db
    .update(verifications)
    .set({ expiresAt: sql`now() - interval '1 second'` })
    .where(eq(verifications.identifier, `password-reset-sent:${userId}`));
}

/** Everything a squatter could leave behind to keep a way in or keep reading the account. */
async function plant(userId: string) {
  const clientId = `client-${uid()}`;
  await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, userId));
  await db.insert(twoFactors).values({ id: uid(), secret: 'planted', backupCodes: 'planted', userId });
  await db.insert(apiKeys).values({ id: uid(), userId, name: 'planted', prefix: 'tk_pl', keyHash: uid(), createdAt: now() });
  await db.insert(accounts).values({
    id: uid(),
    accountId: `gh-${uid()}`,
    providerId: 'github',
    userId,
    createdAt: now(),
    updatedAt: now(),
  });
  await db.insert(oauthClients).values({ id: uid(), clientId, redirectUris: ['https://evil.example/cb'], userId });
  await db.insert(oauthConsents).values({ id: uid(), clientId, userId, scopes: ['read'] });
  await db.insert(oauthRefreshTokens).values({ id: uid(), token: uid(), clientId, userId, scopes: ['read'] });
  await db.insert(slackUserLinks).values({ userId, teamId: `T${uid()}`, slackUserId: `U${uid()}`, createdAt: now() });
  await db.insert(pushSubscriptions).values({
    id: uid(),
    userId,
    endpoint: `https://push.example/${uid()}`,
    p256dh: 'k',
    auth: 'a',
    createdAt: now(),
  });
}

async function planted(userId: string) {
  const count = async (table: typeof twoFactors | typeof apiKeys | typeof oauthConsents | typeof oauthRefreshTokens | typeof oauthClients | typeof slackUserLinks | typeof pushSubscriptions) =>
    (await db.select().from(table).where(eq(table.userId, userId))).length;
  return {
    twoFactor: await count(twoFactors),
    apiKeys: await count(apiKeys),
    oauthClients: await count(oauthClients),
    oauthConsents: await count(oauthConsents),
    oauthRefreshTokens: await count(oauthRefreshTokens),
    slack: await count(slackUserLinks),
    push: await count(pushSubscriptions),
  };
}

const NOTHING_PLANTED = { twoFactor: 0, apiKeys: 0, oauthClients: 0, oauthConsents: 0, oauthRefreshTokens: 0, slack: 0, push: 0 };

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
  return { workspaceId, providerId };
}

describe.skipIf(!localDb)('password reset and account claims', () => {
  beforeAll(() => stubOutboundHttp());
  afterAll(() => {
    vi.unstubAllGlobals();
    for (const key of ['RESEND_API_KEY', 'EMAIL_FROM', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) delete process.env[key];
  });

  it('lets the real owner claim a squatted address by resetting the password', async () => {
    const victim = uniqueEmail('squatted');
    const attacker = await signUp(victim, '/dashboard', ATTACKER_PASSWORD, 'Totally the owner');
    const attackerCookie = cookieOf(attacker);
    const { id: squatId } = await userByEmail(victim);
    await plant(squatId);
    const { workspaceId } = await workspaceWithSso(`kept-${uid()}.test`, false);
    await db.insert(workspaceMembers).values({ id: uid(), workspaceId, userId: squatId, role: 'member', createdAt: now() });

    expect((await requestReset(victim)).status).toBe(200);
    const [mail] = resetMails(victim);
    expect(mail.text).toContain(`/reset-password#token=`);
    expect(mail.text).not.toContain('evil.example');
    expect(mail.text).not.toContain('Totally the owner');
    const reset = await resetPassword(resetTokenFor(victim), OWNER_PASSWORD);
    expect(reset.status).toBe(200);
    expect(await sessionUserId(reset)).toBeNull();

    // The squatter is out: old password refused, session gone, nothing planted survives.
    expect((await signIn(victim, ATTACKER_PASSWORD)).status).toBe(401);
    expect(await sessionOf(attackerCookie)).toBeNull();
    expect(await planted(squatId)).toEqual(NOTHING_PLANTED);
    expect((await accountsOf(squatId)).map((a) => a.providerId)).toEqual(['credential']);
    expect(await userByEmail(victim)).toMatchObject({ id: squatId, emailVerified: true, twoFactorEnabled: false });
    // Kept, as documented: memberships.
    expect(await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, squatId))).toHaveLength(1);

    // The owner signs in with the new password (no planted second factor), and Google now links.
    const owner = await signIn(victim, OWNER_PASSWORD);
    expect(owner.status).toBe(200);
    expect(await sessionUserId(owner)).toBe(squatId);
    const google = await googleSignIn({ sub: `g-${squatId}`, email: victim, email_verified: true, name: 'Victim' });
    expect(google.headers.get('location')).toBe('/dashboard');
    expect(await sessionUserId(google)).toBe(squatId);
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
    expect((await resetPassword(first, OWNER_PASSWORD)).status).toBe(400);

    expect((await resetPassword(second, OWNER_PASSWORD)).status).toBe(200);
    expect((await resetPassword(second, 'another-password-2')).status).toBe(400);

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
    expect((await resetPassword(resetTokenFor(email), OWNER_PASSWORD)).status).toBe(200);

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
    await plant(squatId);

    // The owner (or a mail scanner) opens the verification email signed out: nothing changes.
    await openVerifyLink(verifyLinkFor(victim));
    expect((await userByEmail(victim)).emailVerified).toBe(false);

    // Later the workspace IdP (DNS-proven domain) links the owner's SSO identity to the account.
    await db.update(users).set({ createdAt: sql`now() - interval '5 minutes'` }).where(eq(users.id, squatId));
    const { workspaceId, providerId } = await workspaceWithSso(domain, false);
    await db.insert(accounts).values({ id: uid(), accountId: `idp-${uid()}`, providerId, userId: squatId, createdAt: now(), updatedAt: now() });
    await onIdentityCreated({ providerId, userId: squatId });

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
  });
});
