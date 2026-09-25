// Slack installations (one per Slack workspace) and per-user links. The bot
// token is encrypted at rest with Better Auth's symmetric envelope (keyed by
// BETTER_AUTH_SECRET, same as the GitHub tokens) and only decrypted here.
// No auth in this module: callers authorize.

import { and, eq, ne } from 'drizzle-orm';
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';

import { db } from '@/lib/db';
import { slackInstallations, slackUserLinks } from '@/db/schema';
import { auth } from '@/lib/auth';

export interface SlackInstall {
  id: string;
  teamId: string;
  teamName: string | null;
  token: string;
  botUserId: string | null;
  installedById: string | null;
  defaultProjectId: string | null;
}

export async function encryptToken(token: string): Promise<string> {
  const { secretConfig } = await auth.$context;
  return symmetricEncrypt({ key: secretConfig, data: token });
}

export async function decryptToken(stored: string): Promise<string | null> {
  try {
    const { secretConfig } = await auth.$context;
    return await symmetricDecrypt({ key: secretConfig, data: stored });
  } catch (err) {
    // Rotated secret / corrupted row: treat as not installed.
    console.error('[slack] failed to decrypt bot token', err);
    return null;
  }
}

export async function getInstallation(teamId: string): Promise<SlackInstall | null> {
  if (!teamId) return null;
  const [row] = await db
    .select()
    .from(slackInstallations)
    .where(eq(slackInstallations.teamId, teamId))
    .limit(1);
  if (!row) return null;
  const token = await decryptToken(row.botToken);
  if (!token) return null;
  return {
    id: row.id,
    teamId: row.teamId,
    teamName: row.teamName,
    token,
    botUserId: row.botUserId,
    installedById: row.installedById,
    defaultProjectId: row.defaultProjectId,
  };
}

export async function saveInstallation(input: {
  teamId: string;
  teamName: string | null;
  token: string;
  botUserId: string | null;
  installedById: string;
}): Promise<void> {
  const now = new Date();
  const botToken = await encryptToken(input.token);
  await db
    .insert(slackInstallations)
    .values({
      id: crypto.randomUUID(),
      teamId: input.teamId,
      teamName: input.teamName,
      botToken,
      botUserId: input.botUserId,
      installedById: input.installedById,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: slackInstallations.teamId,
      set: {
        teamName: input.teamName,
        botToken,
        botUserId: input.botUserId,
        installedById: input.installedById,
        updatedAt: now,
      },
    });
}

/**
 * Links an app user to a Slack user proven by OAuth. A Slack user maps to one
 * app user per workspace, so any previous owner of that Slack identity loses it.
 */
export async function linkSlackUser(userId: string, teamId: string, slackUserId: string): Promise<void> {
  await db.batch([
    db
      .delete(slackUserLinks)
      .where(
        and(
          eq(slackUserLinks.teamId, teamId),
          eq(slackUserLinks.slackUserId, slackUserId),
          ne(slackUserLinks.userId, userId),
        ),
      ),
    db
      .insert(slackUserLinks)
      .values({ userId, teamId, slackUserId, notify: true, createdAt: new Date() })
      .onConflictDoUpdate({
        target: [slackUserLinks.userId, slackUserLinks.teamId],
        set: { slackUserId },
      }),
  ]);
}

/** The app user a Slack user is linked to, if any. */
export async function linkedUserId(teamId: string, slackUserId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: slackUserLinks.userId })
    .from(slackUserLinks)
    .where(and(eq(slackUserLinks.teamId, teamId), eq(slackUserLinks.slackUserId, slackUserId)))
    .limit(1);
  return row?.userId ?? null;
}

/** Forgets a workspace entirely (uninstall from either side). */
export async function deleteInstallation(teamId: string): Promise<void> {
  await db.batch([
    db.delete(slackUserLinks).where(eq(slackUserLinks.teamId, teamId)),
    db.delete(slackInstallations).where(eq(slackInstallations.teamId, teamId)),
  ]);
}
