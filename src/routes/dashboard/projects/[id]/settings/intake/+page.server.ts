// Intake form settings + received customer requests. Every member can
// see the requests; only admins toggle or rotate the public link.

import { error } from '@sveltejs/kit';
import { customerPath } from '@/lib/customer-model';
import { DATE_TIME_MEDIUM_FORMAT } from '@/lib/format';
import { appUrl } from '@/lib/integrations/app-url';
import { issuePath } from '@/lib/issue-links';
import { getIntakeRequests, getIntakeSettings } from '@/lib/project-settings-read';
import { roleAllows } from '@/lib/roles';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

const REQUESTS_SHOWN = 50;
const EXCERPT = 180;

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { user, project: membership } = await loadViewerProject(id);

  const [project, requests] = await Promise.all([
    getIntakeSettings(id),
    getIntakeRequests(id, user.id, REQUESTS_SHOWN),
  ]);
  if (!project) error(404, 'Not found');

  return {
    projectId: id,
    url: project.intakeToken ? `${appUrl()}/request/${project.intakeToken}` : null,
    canEdit: roleAllows(membership.role, 'admin'),
    triageEnabled: project.triageEnabled,
    requestsShown: REQUESTS_SHOWN,
    hasToken: !!project.intakeToken,
    // Formatted here (server time zone) so hydration can't disagree about the text.
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
        createdAtLabel: DATE_TIME_MEDIUM_FORMAT.format(request.createdAt),
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
