// Reads behind the Slack settings page (server only). Scoped to the user id the
// caller passes; no authorization here.

import { asc, eq, inArray, or } from 'drizzle-orm';

import { projects, slackInstallations, slackUserLinks, users } from '@/db/schema';
import { db } from '@/lib/db';

export function getSlackUserLinks(userId: string) {
  return db
    .select({ teamId: slackUserLinks.teamId, notify: slackUserLinks.notify })
    .from(slackUserLinks)
    .where(eq(slackUserLinks.userId, userId));
}

/** Installations the user made, plus those of the Slack teams they linked an account in. */
export function getSlackInstallationsFor(userId: string, linkedTeams: string[]) {
  return db
    .select({
      teamId: slackInstallations.teamId,
      teamName: slackInstallations.teamName,
      installedById: slackInstallations.installedById,
      installedByName: users.name,
      defaultProjectId: slackInstallations.defaultProjectId,
      defaultProjectName: projects.name,
      createdAt: slackInstallations.createdAt,
    })
    .from(slackInstallations)
    .leftJoin(users, eq(users.id, slackInstallations.installedById))
    .leftJoin(projects, eq(projects.id, slackInstallations.defaultProjectId))
    .where(
      linkedTeams.length
        ? or(eq(slackInstallations.installedById, userId), inArray(slackInstallations.teamId, linkedTeams))
        : eq(slackInstallations.installedById, userId),
    )
    .orderBy(asc(slackInstallations.createdAt));
}
