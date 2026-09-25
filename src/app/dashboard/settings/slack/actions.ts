'use server';

// Slack app settings: per-workspace default project + uninstall, and the
// viewer's own account link (DM toggle, unlink). A workspace is only visible
// to — and manageable by — people who installed it or linked to it; changing its
// default project or uninstalling also needs admin on the current default
// project (or being the installer), so one member can't hijack another team's Asks.

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, slackInstallations, slackUserLinks } from '@/db/schema';
import { getSession } from '@/lib/session';
import { authorizeProjectAction } from '@/lib/action-auth';
import { slackApi } from '@/lib/slack/api';
import { slackConfig } from '@/lib/slack/config';
import { decryptToken, deleteInstallation } from '@/lib/slack/installations';

type Result = { ok: true } | { ok: false; error: string };

const PATH = '/dashboard/settings/slack';
const ADMIN_ROLES = ['owner', 'admin'] as const;

async function viewerId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/** The install, if the viewer may manage it. */
async function manageable(userId: string, teamId: unknown) {
  if (typeof teamId !== 'string' || !teamId) return null;
  const [install] = await db
    .select({
      teamId: slackInstallations.teamId,
      botToken: slackInstallations.botToken,
      installedById: slackInstallations.installedById,
      defaultProjectId: slackInstallations.defaultProjectId,
    })
    .from(slackInstallations)
    .where(eq(slackInstallations.teamId, teamId))
    .limit(1);
  if (!install) return null;
  if (install.installedById === userId) return install;

  const [[link], adminOfDefault] = await Promise.all([
    db
      .select({ userId: slackUserLinks.userId })
      .from(slackUserLinks)
      .where(and(eq(slackUserLinks.teamId, teamId), eq(slackUserLinks.userId, userId)))
      .limit(1),
    install.defaultProjectId
      ? db
          .select({ id: projectMembers.id })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, install.defaultProjectId),
              eq(projectMembers.userId, userId),
              inArray(projectMembers.role, ADMIN_ROLES),
            ),
          )
          .limit(1)
      : Promise.resolve([{ id: 'none' }]),
  ]);
  return link && adminOfDefault.length > 0 ? install : null;
}

export async function setSlackDefaultProject(input: {
  teamId: string;
  projectId: string | null;
}): Promise<Result> {
  const userId = await viewerId();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  const install = await manageable(userId, input?.teamId);
  if (!install) return { ok: false, error: "You can't manage this Slack workspace." };

  const projectId = input.projectId || null;
  if (projectId) {
    const gate = await authorizeProjectAction(projectId, 'admin');
    if (!gate.ok) return { ok: false, error: 'Only project admins can route Asks to a project.' };
  }
  await db
    .update(slackInstallations)
    .set({ defaultProjectId: projectId, updatedAt: new Date() })
    .where(eq(slackInstallations.teamId, install.teamId));
  revalidatePath(PATH);
  return { ok: true };
}

export async function uninstallSlack(input: { teamId: string }): Promise<Result> {
  const userId = await viewerId();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  const install = await manageable(userId, input?.teamId);
  if (!install) return { ok: false, error: "You can't manage this Slack workspace." };

  // Best effort on Slack's side; forgetting the token is what matters.
  const config = slackConfig();
  const token = await decryptToken(install.botToken);
  if (config && token) {
    const res = await slackApi('apps.uninstall', token, {
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    if (!res.ok) console.error('[slack] apps.uninstall failed', res.error);
  }
  await deleteInstallation(install.teamId);
  revalidatePath(PATH);
  return { ok: true };
}

export async function setSlackDmNotify(input: { teamId: string; notify: boolean }): Promise<Result> {
  const userId = await viewerId();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  if (typeof input?.teamId !== 'string' || typeof input.notify !== 'boolean') {
    return { ok: false, error: 'Invalid input' };
  }
  await db
    .update(slackUserLinks)
    .set({ notify: input.notify })
    .where(and(eq(slackUserLinks.userId, userId), eq(slackUserLinks.teamId, input.teamId)));
  revalidatePath(PATH);
  return { ok: true };
}

export async function unlinkSlack(input: { teamId: string }): Promise<Result> {
  const userId = await viewerId();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  if (typeof input?.teamId !== 'string') return { ok: false, error: 'Invalid input' };
  await db
    .delete(slackUserLinks)
    .where(and(eq(slackUserLinks.userId, userId), eq(slackUserLinks.teamId, input.teamId)));
  revalidatePath(PATH);
  return { ok: true };
}
