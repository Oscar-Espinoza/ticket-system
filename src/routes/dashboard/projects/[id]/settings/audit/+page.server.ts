// Project settings › Audit log: every recorded event for this team (issue and
// comment activity, member / role / settings changes) plus its workspace's
// security events. Owners and admins only; non-members 404.

import { projectHref } from '@/lib/components/app-shell/routes';
import { resolveAuditScope } from '@/lib/audit';
import { loadAuditLogView } from '@/lib/components/audit/audit-log-view.server';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const { id } = params;
  const { user, project } = await loadViewerProject(id);

  const scope = await resolveAuditScope('project', id, user.id);

  return {
    projectName: project.name,
    // null = not an owner / admin: the page shows the "Admins only" state.
    audit: scope
      ? await loadAuditLogView(scope, url.searchParams, projectHref(id, 'settings/audit'))
      : null,
  };
};
