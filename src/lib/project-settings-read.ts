// Reads behind the project settings pages and the cycles page (server only).
// NO AUTHORIZATION here: callers check membership (and role) first. Every query
// is scoped by the project id they pass.

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  customerRequests,
  customers,
  invitations,
  issueLabels,
  projectIntegrations,
  projectMembers,
  projects,
  tickets,
  users,
  webhooks,
  workflowStates,
  workspaces,
} from '@/db/schema';
import { db } from '@/lib/db';
import { rolesAllowing } from '@/lib/roles';
import { memberOfIssueProject } from '@/lib/tickets';

/** First row of a single-project select, or undefined when the project is gone. */
async function first<T>(rows: PromiseLike<T[]>): Promise<T | undefined> {
  return (await rows)[0];
}

/** Projects the user administers, by name (template sources, Slack default projects). */
export function getAdminProjects(userId: string) {
  return db
    .select({ id: projects.id, name: projects.name, ticketKey: projects.ticketKey })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.role, rolesAllowing('admin'))))
    .orderBy(asc(projects.name));
}

export function getCycleSettings(projectId: string) {
  return first(
    db
      .select({
        durationWeeks: projects.cycleDurationWeeks,
        cooldownWeeks: projects.cycleCooldownWeeks,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
  );
}

export function getPlanningSettings(projectId: string) {
  return first(
    db
      .select({
        cyclesEnabled: projects.cyclesEnabled,
        durationWeeks: projects.cycleDurationWeeks,
        startWeekday: projects.cycleStartWeekday,
        cooldownWeeks: projects.cycleCooldownWeeks,
        autoCreate: projects.cycleAutoCreate,
        autoRollover: projects.cycleAutoRollover,
        triageEnabled: projects.triageEnabled,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
  );
}

export function getSlaPolicyRow(projectId: string) {
  return first(
    db.select({ slaPolicy: projects.slaPolicy }).from(projects).where(eq(projects.id, projectId)).limit(1),
  );
}

export function getAutomationSettings(projectId: string) {
  return first(
    db
      .select({
        autoArchiveMonths: projects.autoArchiveMonths,
        autoCloseMonths: projects.autoCloseMonths,
        automationRunAt: projects.automationRunAt,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
  );
}

/** Issues per workflow state; every issue counts (archived and trashed too). */
export function getStateIssueCounts(projectId: string) {
  return db
    .select({ stateId: tickets.stateId, count: sql<number>`cast(count(*) as int)` })
    .from(tickets)
    .where(eq(tickets.projectId, projectId))
    .groupBy(tickets.stateId);
}

/** Active issues per label. */
export function getLabelIssueCounts(projectId: string) {
  return db
    .select({ labelId: issueLabels.labelId, count: sql<number>`cast(count(*) as int)` })
    .from(issueLabels)
    .innerJoin(tickets, eq(issueLabels.ticketId, tickets.id))
    .where(and(eq(tickets.projectId, projectId), isNull(tickets.archivedAt), isNull(tickets.deletedAt)))
    .groupBy(issueLabels.labelId);
}

export function getGeneralSettings(projectId: string) {
  return first(
    db
      .select({
        name: projects.name,
        ticketKey: projects.ticketKey,
        description: projects.description,
        estimateScale: projects.estimateScale,
        workspaceId: projects.workspaceId,
        workspaceName: workspaces.name,
        parentId: projects.parentId,
        visibility: projects.visibility,
      })
      .from(projects)
      .leftJoin(workspaces, eq(projects.workspaceId, workspaces.id))
      .where(eq(projects.id, projectId))
      .limit(1),
  );
}

/** Every project of a workspace by name, with the viewer's membership row id (null when not a member). */
export function getWorkspaceProjectsForViewer(workspaceId: string, viewerId: string) {
  const viewer = alias(projectMembers, 'viewer');
  return db
    .select({
      id: projects.id,
      name: projects.name,
      ticketKey: projects.ticketKey,
      parentId: projects.parentId,
      member: viewer.id,
    })
    .from(projects)
    .leftJoin(viewer, and(eq(viewer.projectId, projects.id), eq(viewer.userId, viewerId)))
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(asc(projects.name));
}

export function getIntakeSettings(projectId: string) {
  return first(
    db
      .select({ intakeToken: projects.intakeToken, triageEnabled: projects.triageEnabled })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
  );
}

/**
 * Received customer requests, newest first. The linked issue joins only
 * through membership of its current project (it may have moved somewhere the
 * viewer can't see), keyed by that project.
 */
export function getIntakeRequests(projectId: string, viewerId: string, limit: number) {
  const issueProject = alias(projects, 'issue_project');
  return db
    .select({
      id: customerRequests.id,
      name: customerRequests.name,
      email: customerRequests.email,
      body: customerRequests.body,
      createdAt: customerRequests.createdAt,
      linkedTicketId: customerRequests.ticketId,
      ticketProjectId: tickets.projectId,
      ticketKey: issueProject.ticketKey,
      number: tickets.ticketNumber,
      title: tickets.title,
      deletedAt: tickets.deletedAt,
      stateName: workflowStates.name,
      stateType: workflowStates.type,
      stateColor: workflowStates.color,
      customerId: customers.id,
      customerName: customers.name,
    })
    .from(customerRequests)
    .leftJoin(tickets, and(eq(customerRequests.ticketId, tickets.id), memberOfIssueProject(viewerId)))
    .leftJoin(issueProject, eq(issueProject.id, tickets.projectId))
    .leftJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .leftJoin(customers, eq(customerRequests.customerId, customers.id))
    .where(eq(customerRequests.projectId, projectId))
    .orderBy(desc(customerRequests.createdAt))
    .limit(limit);
}

export function getSlackSetting(projectId: string) {
  return first(
    db
      .select({ slackWebhookUrl: projects.slackWebhookUrl, slackEvents: projects.slackEvents })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
  );
}

export function getProjectWebhooks(projectId: string) {
  return db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      events: webhooks.events,
      enabled: webhooks.enabled,
      lastStatus: webhooks.lastStatus,
      lastDeliveredAt: webhooks.lastDeliveredAt,
      createdAt: webhooks.createdAt,
    })
    .from(webhooks)
    .where(eq(webhooks.projectId, projectId))
    .orderBy(asc(webhooks.createdAt));
}

export function getGithubSettings(projectId: string) {
  return first(
    db
      .select({
        repo: projects.githubRepo,
        webhookId: projects.githubWebhookId,
        prOpenStateId: projects.githubPrOpenStateId,
        prMergeStateId: projects.githubPrMergeStateId,
        connectedByName: users.name,
      })
      .from(projects)
      .leftJoin(users, eq(users.id, projects.githubConnectedById))
      .where(eq(projects.id, projectId))
      .limit(1),
  );
}

/** Integration rows without their token: only whether one is stored. */
export function getProjectIntegrations(projectId: string) {
  return db
    .select({
      id: projectIntegrations.id,
      provider: projectIntegrations.provider,
      config: projectIntegrations.config,
      hasToken: sql<boolean>`${projectIntegrations.token} is not null`,
      connectedByName: users.name,
    })
    .from(projectIntegrations)
    .leftJoin(users, eq(users.id, projectIntegrations.createdById))
    .where(eq(projectIntegrations.projectId, projectId));
}

export function getProjectRoster(projectId: string) {
  return db
    .select({
      id: projectMembers.id,
      userId: projectMembers.userId,
      name: users.name,
      email: users.email,
      image: users.image,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId));
}

/** Pending (not accepted) invitations, oldest first. Tokens are credentials: admins only. */
export function getPendingInvitations(projectId: string) {
  return db
    .select({
      id: invitations.id,
      token: invitations.token,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      invitedByName: users.name,
    })
    .from(invitations)
    .leftJoin(users, eq(invitations.invitedById, users.id))
    .where(and(eq(invitations.projectId, projectId), isNull(invitations.acceptedAt)))
    .orderBy(asc(invitations.createdAt));
}
