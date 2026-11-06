// Slack app settings: per-workspace default project + uninstall, and the
// viewer's own account link (DM toggle, unlink). A workspace is only visible
// to — and manageable by — people who installed it or linked to it; changing its
// default project or uninstalling also needs admin on the current default
// project (or being the installer), so one member can't hijack another team's Asks.

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, slackInstallations, slackUserLinks } from '@/db/schema';
import { sessionUserId } from '@/lib/session';
import { authorizeProjectAction } from '@/lib/action-auth';
import { rolesAllowing } from '@/lib/roles';
import { fail, NOT_AUTHENTICATED, refreshesData, type ActionResult } from '@/lib/server/action-kit';
import { slackApi } from '@/lib/slack/api';
import { slackConfig } from '@/lib/slack/config';
import { deleteInstallation } from '@/lib/slack/installations';
import { decryptToken } from '@/lib/server/crypto';

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
              inArray(projectMembers.role, rolesAllowing('admin')),
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
}): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  const install = await manageable(userId, input?.teamId);
  if (!install) return fail("You can't manage this Slack workspace.");

  const projectId = input.projectId || null;
  if (projectId) {
    const gate = await authorizeProjectAction(projectId, 'admin');
    if (!gate.ok) return fail('Only project admins can route Asks to a project.');
  }
  await db
    .update(slackInstallations)
    .set({ defaultProjectId: projectId, updatedAt: new Date() })
    .where(eq(slackInstallations.teamId, install.teamId));
  refreshesData();
  return { ok: true };
}

export async function uninstallSlack(input: { teamId: string }): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  const install = await manageable(userId, input?.teamId);
  if (!install) return fail("You can't manage this Slack workspace.");

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
  refreshesData();
  return { ok: true };
}

export async function setSlackDmNotify(input: { teamId: string; notify: boolean }): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  if (typeof input?.teamId !== 'string' || typeof input.notify !== 'boolean') {
    return fail('Invalid input');
  }
  await db
    .update(slackUserLinks)
    .set({ notify: input.notify })
    .where(and(eq(slackUserLinks.userId, userId), eq(slackUserLinks.teamId, input.teamId)));
  refreshesData();
  return { ok: true };
}

export async function unlinkSlack(input: { teamId: string }): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  if (typeof input?.teamId !== 'string') return fail('Invalid input');
  await db
    .delete(slackUserLinks)
    .where(and(eq(slackUserLinks.userId, userId), eq(slackUserLinks.teamId, input.teamId)));
  refreshesData();
  return { ok: true };
}
