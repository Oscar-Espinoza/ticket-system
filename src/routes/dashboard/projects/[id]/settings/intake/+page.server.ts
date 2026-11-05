// Intake form settings + received customer requests (B11). Every member can
// see the requests; only admins toggle or rotate the public link.

import { error, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { customerPath } from '@/lib/components/customers/customer-model';
import { customerRequests, customers, projects, tickets, workflowStates } from '@/db/schema';
import { db } from '@/lib/db';
import { appUrl } from '@/lib/integrations/app-url';
import { issuePath } from '@/lib/issue-links';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import { memberOfIssueProject } from '@/lib/tickets';
import type { PageServerLoad } from './$types';

const issueProject = alias(projects, 'issue_project');

const REQUESTS_SHOWN = 50;
const EXCERPT = 180;
const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) redirect(303, '/login');

  const membership = await getMemberProject(id, locals.user.id);
  if (!membership) error(404, 'Not found');

  const [[project], requests] = await Promise.all([
    db
      .select({ intakeToken: projects.intakeToken, triageEnabled: projects.triageEnabled })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1),
    db
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
      // The issue may have moved to a project the viewer can't see: join it
      // only through membership of its current project, keyed by that project.
      .leftJoin(
        tickets,
        and(eq(customerRequests.ticketId, tickets.id), memberOfIssueProject(locals.user.id)),
      )
      .leftJoin(issueProject, eq(issueProject.id, tickets.projectId))
      .leftJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
      .leftJoin(customers, eq(customerRequests.customerId, customers.id))
      .where(eq(customerRequests.projectId, id))
      .orderBy(desc(customerRequests.createdAt))
      .limit(REQUESTS_SHOWN),
  ]);
  if (!project) error(404, 'Not found');

  return {
    projectId: id,
    url: project.intakeToken ? `${appUrl()}/request/${project.intakeToken}` : null,
    canEdit: roleAllows(membership.role, 'admin'),
    triageEnabled: project.triageEnabled,
    requestsShown: REQUESTS_SHOWN,
    hasToken: !!project.intakeToken,
    // Formatted here (server time zone, as the React server component did) so
    // hydration can't disagree about the text.
    requests: requests.map((request) => {
      const key =
        request.number !== null && request.ticketKey ? `${request.ticketKey}-${request.number}` : null;
      const linked =
        key && request.stateType && request.ticketProjectId
          ? {
              href: issuePath(request.ticketProjectId, key),
              key,
              title: request.title,
              stateType: request.stateType,
              stateColor: request.stateColor,
              stateName: request.stateName,
              inTrash: !!request.deletedAt,
            }
          : null;
      return {
        id: request.id,
        linked,
        hadTicket: !!request.linkedTicketId,
        createdAtIso: request.createdAt.toISOString(),
        createdAtLabel: dateFormat.format(request.createdAt),
        customer:
          request.customerId && request.customerName
            ? { href: customerPath(id, request.customerId), name: request.customerName }
            : null,
        name: request.name,
        email: request.email,
        excerpt:
          request.body.length > EXCERPT ? `${request.body.slice(0, EXCERPT)}…` : request.body,
      };
    }),
  };
};
