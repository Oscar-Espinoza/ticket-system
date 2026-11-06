// Reads behind the account settings pages and the viewer's drafts (server
// only). NO AUTHORIZATION here: every query is scoped to the user id the
// caller passes, which comes from the session.

import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';

import {
  accounts,
  apiKeys,
  issueDrafts,
  oauthClients,
  oauthConsents,
  projectMembers,
  projects,
  pushSubscriptions,
  sessions,
  userProfiles,
  users,
} from '@/db/schema';
import { db } from '@/lib/db';

/** Password change only makes sense for email/password sign-ups: GitHub-only accounts have no credential row. */
const credentialAccount = (userId: string) =>
  db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')))
    .limit(1);

export async function getProfileSettings(userId: string) {
  const [[profile], [credential]] = await Promise.all([
    db
      .select({
        title: userProfiles.title,
        bio: userProfiles.bio,
        timezone: userProfiles.timezone,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1),
    credentialAccount(userId),
  ]);
  return { profile, hasPassword: Boolean(credential) };
}

export function getActiveApiKeys(userId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function getNotificationSettings(userId: string) {
  const [[profile], devices] = await Promise.all([
    db
      .select({
        emailNotifications: userProfiles.emailNotifications,
        prefs: userProfiles.notificationPrefs,
        digest: userProfiles.digestFrequency,
        push: userProfiles.pushNotifications,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1),
    db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        userAgent: pushSubscriptions.userAgent,
        createdAt: pushSubscriptions.createdAt,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .orderBy(desc(pushSubscriptions.createdAt)),
  ]);
  return { profile, devices };
}

/** 2FA state is read from the DB (the session cookie cache can lag), with the credential row and live sessions, in one batch. */
export async function getSecuritySettings(userId: string) {
  const [[user], [credential], sessionRows] = await db.batch([
    db
      .select({ twoFactorEnabled: users.twoFactorEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    credentialAccount(userId),
    db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.updatedAt))
      .limit(50),
  ]);
  return { user, hasPassword: !!credential, sessionRows };
}

export async function getOAuthSettings(userId: string) {
  const [apps, consents] = await Promise.all([
    db
      .select({
        clientId: oauthClients.clientId,
        name: oauthClients.name,
        icon: oauthClients.icon,
        uri: oauthClients.uri,
        redirectUris: oauthClients.redirectUris,
        isPublic: oauthClients.public,
        createdAt: oauthClients.createdAt,
      })
      .from(oauthClients)
      .where(eq(oauthClients.userId, userId))
      .orderBy(asc(oauthClients.createdAt)),
    db
      .select({
        id: oauthConsents.id,
        clientId: oauthConsents.clientId,
        scopes: oauthConsents.scopes,
        grantedAt: oauthConsents.updatedAt,
        name: oauthClients.name,
        icon: oauthClients.icon,
        uri: oauthClients.uri,
      })
      .from(oauthConsents)
      .innerJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
      .where(eq(oauthConsents.userId, userId))
      .orderBy(desc(oauthConsents.updatedAt)),
  ]);
  return { apps, consents };
}

/** The viewer's drafts; those in projects they have left drop out through the member join. */
export function getDrafts(userId: string) {
  return db
    .select({
      id: issueDrafts.id,
      title: issueDrafts.title,
      description: issueDrafts.description,
      updatedAt: issueDrafts.updatedAt,
      projectId: issueDrafts.projectId,
      projectName: projects.name,
      ticketKey: projects.ticketKey,
    })
    .from(issueDrafts)
    .innerJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, issueDrafts.projectId),
        eq(projectMembers.userId, issueDrafts.userId),
      ),
    )
    .innerJoin(projects, eq(projects.id, issueDrafts.projectId))
    .where(eq(issueDrafts.userId, userId))
    .orderBy(desc(issueDrafts.updatedAt))
    .limit(200);
}
