// Lookups behind the public token pages (intake form, invite landing, OAuth
// consent) (server only). The token or client id is the only credential, so
// these return only what the page renders.

import { and, eq, gt, isNull } from 'drizzle-orm';

import { invitations, oauthClients, projects, users } from '@/db/schema';
import { db } from '@/lib/db';

export async function getIntakeProjectName(token: string) {
  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.intakeToken, token))
    .limit(1);
  return project;
}

/** An unexpired, unaccepted invitation by token. */
export async function getOpenInvitation(token: string) {
  const [invitation] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      projectName: projects.name,
      inviterName: users.name,
    })
    .from(invitations)
    .innerJoin(projects, eq(invitations.projectId, projects.id))
    .leftJoin(users, eq(invitations.invitedById, users.id))
    .where(
      and(
        eq(invitations.token, token),
        gt(invitations.expiresAt, new Date()),
        isNull(invitations.acceptedAt),
      ),
    )
    .limit(1);
  return invitation;
}

export async function getConsentClient(clientId: string) {
  const [client] = await db
    .select({
      name: oauthClients.name,
      icon: oauthClients.icon,
      uri: oauthClients.uri,
      policy: oauthClients.policy,
      tos: oauthClients.tos,
      disabled: oauthClients.disabled,
      metadata: oauthClients.metadata,
    })
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  return client;
}
